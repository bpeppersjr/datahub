# Illinois Business Registry import packages

Place each manually obtained, official five-file Illinois SOS daily package in:

`data/imports/illinois-business-registry/packages/<package-id>/`

Create `selection.json` in that directory using `selection.example.json` as the shape. Every filename is a single basename in the same package directory; absolute paths, subdirectories, links, missing files, and extra selection keys are rejected. Files may be the original one-member ZIPs or extracted fixed-width files supported by the underlying connector.

The application worker performs no network request or source discovery. It copies the five selected files to a temporary operation-local snapshot, checks every copy against the preflight size and SHA-256, and removes that raw snapshot after use. It writes only beneath `data/imports/illinois-business-registry/operations/<operation-id>/`; it does not change the Illinois source pointer, national registry, coverage releases, or broad-layer admission.
