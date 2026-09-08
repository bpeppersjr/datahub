"""Fail-closed, process-lifetime limits for an app-owned PDF subprocess.

Windows committed-memory cap: https://learn.microsoft.com/en-us/windows/win32/api/winnt/ns-winnt-jobobject_extended_limit_information
Linux address-space cap: https://docs.python.org/3/library/resource.html
This guard writes no logs. It is not a sandbox for executing untrusted code.
"""

import ctypes
import math
import os
import sys
import threading
import time

_JOB_HANDLES = []  # OS closes these on process exit; closing early kills self.


class GuardUnavailable(RuntimeError):
    pass


class GuardCancelled(RuntimeError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _windows_limit(memory_bytes):
    from ctypes import wintypes as w

    class Basic(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_longlong),
                    ("PerJobUserTimeLimit", ctypes.c_longlong),
                    ("LimitFlags", w.DWORD), ("MinimumWorkingSetSize", ctypes.c_size_t),
                    ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", w.DWORD),
                    ("Affinity", ctypes.c_size_t), ("PriorityClass", w.DWORD),
                    ("SchedulingClass", w.DWORD)]

    class Counters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in
                    ("ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
                     "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]

    class Extended(ctypes.Structure):
        _fields_ = [("BasicLimitInformation", Basic), ("IoInfo", Counters),
                    ("ProcessMemoryLimit", ctypes.c_size_t), ("JobMemoryLimit", ctypes.c_size_t),
                    ("PeakProcessMemoryUsed", ctypes.c_size_t), ("PeakJobMemoryUsed", ctypes.c_size_t)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    for name, args, result in (
        ("CreateJobObjectW", [ctypes.c_void_p, w.LPCWSTR], w.HANDLE),
        ("SetInformationJobObject", [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD], w.BOOL),
        ("QueryInformationJobObject", [w.HANDLE, ctypes.c_int, ctypes.c_void_p, w.DWORD, ctypes.c_void_p], w.BOOL),
        ("AssignProcessToJobObject", [w.HANDLE, w.HANDLE], w.BOOL),
        ("GetCurrentProcess", [], w.HANDLE),
        ("CloseHandle", [w.HANDLE], w.BOOL),
    ):
        fn = getattr(kernel, name)
        fn.argtypes, fn.restype = args, result
    job = kernel.CreateJobObjectW(None, None)
    if not job:
        raise GuardUnavailable("memory guard initialization failed")
    assigned = False
    try:
        limits = Extended()
        limits.BasicLimitInformation.LimitFlags = 0x100 | 0x2000
        limits.ProcessMemoryLimit = memory_bytes
        if not kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)):
            raise GuardUnavailable("memory guard configuration failed")
        observed = Extended()
        if not kernel.QueryInformationJobObject(job, 9, ctypes.byref(observed), ctypes.sizeof(observed), None):
            raise GuardUnavailable("memory guard verification failed")
        if observed.ProcessMemoryLimit != memory_bytes or observed.BasicLimitInformation.LimitFlags & 0x2100 != 0x2100:
            raise GuardUnavailable("memory guard limits mismatch")
        if not kernel.AssignProcessToJobObject(job, kernel.GetCurrentProcess()):
            raise GuardUnavailable("memory guard assignment failed")
        assigned = True
        _JOB_HANDLES.append(job)
        return "windows-job-process-commit"
    finally:
        if not assigned:
            kernel.CloseHandle(job)


def _memory_limit(memory_bytes):
    if sys.platform == "win32":
        return _windows_limit(memory_bytes)
    if sys.platform == "linux":
        import resource
        soft, hard = resource.getrlimit(resource.RLIMIT_AS)
        cap = min(memory_bytes, hard) if hard != resource.RLIM_INFINITY else memory_bytes
        if soft != resource.RLIM_INFINITY:
            cap = min(cap, soft)
        resource.setrlimit(resource.RLIMIT_AS, (cap, cap))
        if resource.getrlimit(resource.RLIMIT_AS) != (cap, cap):
            raise GuardUnavailable("memory guard verification failed")
        return "linux-rlimit-address-space"
    raise GuardUnavailable("unsupported memory guard platform")


class ProcessGuard:
    """One guard per short-lived process; limits cannot be removed by close().

    Parent keeps stdin open during work; any byte or EOF requests cancellation.
    Page/glyph loops call check_cancelled(). Watchdog reserves up to 250ms of
    the wall budget for cooperative timeout handling, then exits with code 124.
    A parent watchdog must still kill a child stuck in native code holding GIL.
    """

    def __init__(self, memory_bytes=1_073_741_824, timeout_seconds=60, cancel_stream=None):
        if isinstance(memory_bytes, bool) or not isinstance(memory_bytes, int) or not 64 * 1024 * 1024 <= memory_bytes <= 1_073_741_824:
            raise ValueError("invalid memory budget")
        if isinstance(timeout_seconds, bool) or not isinstance(timeout_seconds, (int, float)) or not math.isfinite(timeout_seconds) or not 0.1 <= timeout_seconds <= 60:
            raise ValueError("invalid time budget")
        self.memory_bytes = memory_bytes
        self.timeout_seconds = timeout_seconds
        self.cancel_stream = sys.stdin.buffer if cancel_stream is None else cancel_stream
        self._done = threading.Event()
        self._cancelled = threading.Event()
        self._reason = None
        self._started = False
        self.backend = None

    def start(self):
        if self._started:
            raise GuardUnavailable("guard already started")
        self._started = True
        try:
            self._stdin_fd = self.cancel_stream.fileno()
            self.backend = _memory_limit(self.memory_bytes)
            self._deadline = time.monotonic() + self.timeout_seconds
            threading.Thread(target=self._watch_stdin, daemon=True).start()
            threading.Thread(target=self._watch_deadline, daemon=True).start()
        except GuardUnavailable:
            raise
        except Exception:
            raise GuardUnavailable("process guard initialization failed") from None
        return self

    def _cancel(self, reason):
        if not self._cancelled.is_set():
            self._reason = reason
            self._cancelled.set()

    def _watch_stdin(self):
        try:
            os.read(self._stdin_fd, 1)  # No buffered-stream lock at shutdown.
        except OSError:
            pass  # Broken control channel is cancellation, never permission to continue.
        if not self._done.is_set():
            self._cancel("cancelled")

    def _watch_deadline(self):
        grace = min(0.25, self.timeout_seconds / 4)
        if self._done.wait(max(0, self._deadline - time.monotonic() - grace)):
            return
        self._cancel("timeout")
        if not self._done.wait(max(0, self._deadline - time.monotonic())):
            os._exit(124)

    def check_cancelled(self):
        if not self._started:
            raise GuardUnavailable("guard not started")
        if self._cancelled.is_set():
            raise GuardCancelled(self._reason)

    def close(self):
        self._done.set()
