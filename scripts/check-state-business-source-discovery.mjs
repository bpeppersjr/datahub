import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH,
  loadStateBusinessSourceRevalidation,
  summarizeStateBusinessSourceRevalidation,
} from "../runner/state-business-source-revalidation.mjs";
import { assessStateBusinessSourceReadiness } from "../runner/business-state-source-readiness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUEUE_PATHS = [
  path.join(ROOT, "config", "state-business-source-discovery-queue-4.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-2.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-4-wave-3.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-5.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-6.json"),
  path.join(ROOT, "config", "state-business-source-discovery-queue-7.json"),
];
const CURRENT_COVERAGE_POINTER_PATH = path.join(ROOT, "data", "business-coverage-views", "current.json");
const EXPECTED_COVERAGE_RELEASE_ID = "national-business-coverage-views-20260902-115337634Z-ba689784";
const QUEUE_6_ID = "state-business-source-discovery-queue-6-wave-1-2026-09-03";
const QUEUE_7_ID = "state-business-source-discovery-queue-7-wave-1-2026-09-03";
const QUEUE_SCOPES = new Map([
  ["state-business-source-discovery-queue-4-wave-1-2026-09-03", { scope: ["ID", "NM", "ME", "WY"], contentDigest: "d22322c16cfa6ed2874026e0802c144dbcbf15a9f4b2a54e2b61000d76555deb" }],
  ["state-business-source-discovery-queue-4-wave-2-2026-09-03", { scope: ["NH", "MT", "RI", "SD"], contentDigest: "9589562225aaf53534763d562ca44a16b46ed404a231e9e72036c9d3b8293e71" }],
  ["state-business-source-discovery-queue-4-wave-3-2026-09-03", {
    scope: ["VT", "WV", "ND", "DC", "AK"],
    contentDigest: "fd47b245914c9605e8034b53cb7d080fce87d3192a1c6a5eda1765d1d9f5fbd2",
    decisions: ["hold", "hold", "hold", "proceed-to-bounded-connector", "proceed-to-bounded-connector"],
    gates: {
      DC: ["stable-identifier", "address-role", "change-contract", "large-acquisition-authorization"],
      AK: ["source-scope", "stable-identifier", "status-codebook", "change-contract", "rights", "large-acquisition-authorization"],
    },
  }],
]);
const REQUIRED_GATES = ["source-scope", "schema", "stable-identifier", "status-codebook", "address-role", "change-contract", "automation", "rights", "privacy"];
const ZERO_ACTION_CONTROLS = ["accounts_created", "terms_accepted", "purchases_made", "completed_bulk_record_downloads", "broad_portal_queries", "access_controls_bypassed", "production_pointers_changed"];
const WAVE_3_ALLOWED_OPERATIONS = ["metadata-and-aggregate-preflight", "bounded-header-preflight", "offline-fixture-validation-and-local-review-release"];
const WAVE_3_FORBIDDEN_OPERATIONS = ["complete-source-acquisition", "paid-acquisition", "live-source-release-publication", "production-registry-rebuild", "coverage-publication", "heatmap-admission", "production-pointer-change"];
const QUEUE_5_FORBIDDEN_OPERATIONS = ["account-creation", "terms-acceptance", "purchase", "record-level-request", "record-enumeration", "portal-automation", "complete-bulk-download", "connector-implementation", "source-release-publication", "registry-rebuild", "coverage-publication", "heatmap-admission", "production-pointer-change"];
const QUEUE_5_EXCLUDED_DATA_CLASSES = ["registered-agent-and-service-address", "natural-person-name-role-and-address", "direct-contact-and-signature", "tax-payment-financial-and-government-identifiers", "filing-image-document-and-free-text"];
const QUEUE_6_EXCLUDED_DATA_CLASSES = ["registered-agent-and-service-address", "natural-person-name-role-and-address", "direct-contact-and-signature", "sensitive-personal-tax-payment-financial-and-nonregistry-government-identifiers", "filing-image-document-and-free-text"];
const QUEUE_5_ASSIGNMENTS = [
  { state_abbreviation: "OH", worker: "Confucius", ran_in_parallel: true },
  { state_abbreviation: "NC", worker: "Mill", ran_in_parallel: true },
  { state_abbreviation: "NJ", worker: "Gauss", ran_in_parallel: true },
  { state_abbreviation: "VA", worker: "root", ran_in_parallel: true },
];
const QUEUE_5_WAVES = [{
  wave_id: "queue-5-wave-1",
  concurrent_state_abbreviations: ["OH", "NC", "NJ", "VA"],
  overlap_evidence: "Ohio, North Carolina, and New Jersey agents were active while the root Virginia workstream inspected official sources.",
}];
const QUEUE_6_ASSIGNMENTS = [
  { state_abbreviation: "MI", worker: "Confucius", ran_in_parallel: true },
  { state_abbreviation: "TN", worker: "Mill", ran_in_parallel: true },
  { state_abbreviation: "MA", worker: "Gauss", ran_in_parallel: true },
  { state_abbreviation: "AZ", worker: "root", ran_in_parallel: true },
];
const QUEUE_6_WAVES = [{
  wave_id: "queue-6-wave-1",
  concurrent_state_abbreviations: ["MI", "TN", "MA", "AZ"],
  overlap_evidence: "Michigan, Tennessee, and Massachusetts agents were active while the root Arizona workstream inspected official sources.",
}];
const QUEUE_7_ASSIGNMENTS = [
  { state_abbreviation: "MD", worker: "Confucius", ran_in_parallel: true },
  { state_abbreviation: "MO", worker: "Mill", ran_in_parallel: true },
  { state_abbreviation: "IN", worker: "Gauss", ran_in_parallel: true },
  { state_abbreviation: "SC", worker: "root", ran_in_parallel: true },
];
const QUEUE_7_WAVES = [{
  wave_id: "queue-7-wave-1",
  concurrent_state_abbreviations: ["MD", "MO", "IN", "SC"],
  overlap_evidence: "Maryland, Missouri, and Indiana agents were active while the root South Carolina workstream inspected official sources.",
}];
const QUEUE_5_CANDIDATES = {
  OH: { publisher: "Ohio Secretary of State", product: "Business Filing Data", availability: "paid one-time FTP order; recurring delivery requires a separate unpublished contract", price: "$62.50 one-time FTP; weekly or monthly price is unpublished" },
  NC: { publisher: "North Carolina Secretary of State", product: "Business Registration Division Master Files Subscription — Core export", availability: "paid weekly relational CSV snapshot over FTP; current contract and data contract are unpublished", price: "$750 setup plus $2,000 per North Carolina state fiscal year" },
  NJ: { publisher: "New Jersey Division of Revenue and Enterprise Services", product: "Bulk Access Status Reports — line item 01000000", availability: "written paid bulk request with quoted FTP, email, disk, or paper delivery and optional ongoing updates", price: "$0.0185 per record plus any quoted media or payment charges" },
  VA: { publisher: "Virginia State Corporation Commission Office of the Clerk", product: "requested business-entity structured-data extract", availability: "discretionary structured-data request with reasonable fees; no documented recurring product or public bulk file", price: "Unknown; reasonable database or structured-data fees may be quoted" },
};
const QUEUE_5_COVERAGE = {
  OH: { reported_profiles: 163604, coordinate_profiles: 12926, nonemployer_baseline_2023: 909227, baseline_minus_profiles: 745623, diagnostic_profile_percent: 18, material_zctas: 1234, zctas_with_record_level_evidence: 1220 },
  NC: { reported_profiles: 175876, coordinate_profiles: 11346, nonemployer_baseline_2023: 920236, baseline_minus_profiles: 744360, diagnostic_profile_percent: 19.1, material_zctas: 853, zctas_with_record_level_evidence: 849 },
  NJ: { reported_profiles: 156337, coordinate_profiles: 8251, nonemployer_baseline_2023: 883628, baseline_minus_profiles: 727291, diagnostic_profile_percent: 17.7, material_zctas: 603, zctas_with_record_level_evidence: 603 },
  VA: { reported_profiles: 116537, coordinate_profiles: 8316, nonemployer_baseline_2023: 740321, baseline_minus_profiles: 623784, diagnostic_profile_percent: 15.7, material_zctas: 908, zctas_with_record_level_evidence: 902 },
};
const QUEUE_5_URLS = {
  OH: ["https://www.ohiosos.gov/business/business-filing-forms", "https://www.ohiosos.gov/assets/200.pdf", "https://www.ohiosos.gov/business/business-reports", "https://www.ohiosos.gov/business/ohio-business-roadmap/frequently-asked-questions", "https://codes.ohio.gov/ohio-revised-code/section-1706.161", "https://codes.ohio.gov/ohio-revised-code/section-149.43/9-30-2025", "https://www.ohiosos.gov/privacy-statement"],
  NC: ["https://www.sosnc.gov/online_services/data_subscriptions/about_the_data", "https://www.sosnc.gov/manual/assets/sos/pdf/data_subscriptions.pdf", "https://www.sosnc.gov/documents/forms/Data_Subcriptions/Business_Registration_layout.pdf", "https://www.sosnc.gov/fees/by_title/_data_subscriptions?area=Divisions", "https://www.sosnc.gov/manual/launching_a_business/register_your_business", "https://www.sosnc.gov/manual/General_Counsel/Page21", "https://www.sosnc.gov/divisions/business_registration", "https://www.ncleg.gov/enactedlegislation/statutes/html/bysection/chapter_132/gs_132-1.html", "https://www.ncleg.gov/enactedlegislation/statutes/html/bysection/chapter_132/gs_132-6.html", "https://www.nc.gov/terms"],
  NJ: ["https://www.nj.gov/treasury/revenue/fees.shtml", "https://nj.gov/treasury/proposed_rules/PRN%202015-154%20(47%20NJR%202912(a)).pdf", "https://www.nj.gov/treasury/proposed_rules/NoR17_3455NJR1741a.pdf", "https://www.nj.gov/treasury/revenue/guiderequest.shtml", "https://www.njportal.com/dor/businessrecords/EntityDocs/BusinessStatCopies.aspx", "https://www.njportal.com/DOR/businessrecords/Samples/SampleStatusReports.pdf", "https://www1.nj.gov/TYTR_BRC/jsp/BRCLoginJsp.jsp", "https://www.njportal.com/dor/businessrecords/EntityDocs/BusinessList.aspx", "https://www.njportal.com/errorpages/disclaimer.aspx", "https://www.nj.gov/treasury/revenue/revgencode.shtml"],
  VA: ["https://www.scc.virginia.gov/businesses/about-the-clerks-office/", "https://law.lis.virginia.gov/vacode/title12.1/chapter4/section12.1-19/", "https://law.lis.virginia.gov/vacode/title12.1/chapter4/section12.1-21.2/", "https://law.lis.virginia.gov/admincode/title5/agency5/chapter40/section10/", "https://www.scc.virginia.gov/accessibility-and-web-policy/", "https://appspre.scc.virginia.gov/procure/rfp_scc12020_scc.pdf", "https://appspre.scc.virginia.gov/clk/files/cismanual.pdf", "https://cis.scc.virginia.gov/EntitySearch/Index", "https://www.scc.virginia.gov/about-the-scc/contact-us/"],
};
const QUEUE_6_CANDIDATES = {
  MI: { publisher: "Michigan Department of Licensing and Regulatory Affairs, Corporations Division", product: "customized nonconfidential business-entity database extract", availability: "possible written customized listing under FY2026 enabling authority; no published bulk product, API, recurring delivery contract, or current machine schema", price: "Unknown; LARA may quote a reasonable fee plus applicable production or FOIA costs" },
  TN: { publisher: "Tennessee Secretary of State, Division of Business and Charitable Organizations", product: "Business Entity Database through TNCaB", availability: "official user-directed purchase and download; no public current price, order contract, subscription, anonymous file route, API, or recurring-delivery specification", price: "Unknown; current database price and service fees are not published" },
  MA: { publisher: "Massachusetts Secretary of the Commonwealth, Corporations Division", product: "Corporations Information Management System full extract", availability: "paid extract available monthly in weekly increments; data elements and file layout are supplied only by the filing office on request", price: "$4,800 per year or $100 per week; filing images are extra and excluded" },
  AZ: { publisher: "Arizona Corporation Commission, Corporations Division", product: "Public Records Request / Database Extraction", availability: "paid full database as double-quote-delimited CSV by CD-ROM or download, or partial extraction by CD-ROM or email, after a signed purpose statement; custom requests may be denied or additionally priced", price: "$1,000 full database or $75 partial extraction; commercial-use and current public-record fees may also apply" },
};
const QUEUE_6_COVERAGE = {
  MI: { reported_profiles: 191395, coordinate_profiles: 11964, nonemployer_baseline_2023: 815013, baseline_minus_profiles: 623618, diagnostic_profile_percent: 23.5, material_zctas: 993, zctas_with_record_level_evidence: 991 },
  TN: { reported_profiles: 91467, coordinate_profiles: 8676, nonemployer_baseline_2023: 649168, baseline_minus_profiles: 557701, diagnostic_profile_percent: 14.1, material_zctas: 641, zctas_with_record_level_evidence: 638 },
  MA: { reported_profiles: 118917, coordinate_profiles: 7560, nonemployer_baseline_2023: 633439, baseline_minus_profiles: 514522, diagnostic_profile_percent: 18.8, material_zctas: 540, zctas_with_record_level_evidence: 540 },
  AZ: { reported_profiles: 99038, coordinate_profiles: 6080, nonemployer_baseline_2023: 598126, baseline_minus_profiles: 499088, diagnostic_profile_percent: 16.6, material_zctas: 420, zctas_with_record_level_evidence: 420 },
};
const QUEUE_6_URLS = {
  MI: ["https://www.michigan.gov/budget/-/media/Project/Websites/budget/Fiscal/Final-Signed-Budget-Bills/FY26-General-Omnibus-HB-4706-PA-22-of-2025-Includes-2025-Supplemental-Funding.pdf", "https://www.michigan.gov/lara/bureau-list/cscl/corps", "https://www.michigan.gov/lara/bureau-list/cscl/corps/mibrp/new-system", "https://www.michigan.gov/som/footer/policies", "https://www.michigan.gov/lara/foia-request", "https://www.michigan.gov/lara/-/media/Project/Websites/lara/Folder6/FOIA_Procedure_and_Guidelines.pdf", "https://www.michigan.gov/lara/bureau-list/cscl/corps/other/total-business-entities-as-of-october-10-2025", "https://www.michigan.gov/lara/bureau-list/cscl/corps/frequently-asked-questions", "https://www.michigan.gov/lara/bureau-list/cscl/corps/how-do-i/services/email-your-inquiries-to-the-corporations-division"],
  TN: ["https://sos.tn.gov/business-services", "https://tncab.tnsos.gov/portal", "https://sos.tn.gov/businesses/forms-and-fees", "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/2024%20Q4%20Quarterly%20Business%20and%20Economic%20Report.pdf?VersionId=igKxbwwpJ928hASJ7EeQRAiT06hTqAp8", "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/202503_SS-4800%20P3.pdf?VersionId=p8vVMPK._sk.yWzweBUhjVwvAjfBRvO_", "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/SS-9424.pdf?VersionId=9BNfi2cNqBmTz6DR.EZ9IQyANiL67lFB", "https://www.tn.gov/content/dam/tn/revenue/documents/tax_manuals/june-2025/Frachise-Excise-Tax-Manual.pdf", "https://sos-prod.tnsosgovfiles.com/s3fs-public/document/Department%20of%20State%20Model%20Policy_0.pdf?VersionId=z.xeYQlouqLHH23xxZPap1ZzVg9G1dev", "https://comptroller.tn.gov/office-functions/open-records-counsel/open-meetings/frequently-asked-questions/tennessee-public-records-act-faqs.html"],
  MA: ["https://www.mass.gov/regulations/950-CMR-11300-the-massachusetts-business-corporation-act-mgl-c-156d", "https://www.sec.state.ma.us/divisions/corporations/download/950113.pdf", "https://www.mass.gov/info-details/massachusetts-law-about-corporations", "https://www.sec.state.ma.us/divisions/cis/guide/secretary.htm", "https://corp.sec.state.ma.us/corpweb/CorpSearch/CorpSearch.aspx", "https://www.mass.gov/info-details/dcms-tip-sheet-volume-5-edition-13-reminders-regarding-your-annual-report", "https://www.sec.state.ma.us/divisions/terms.htm", "https://malegislature.gov/Laws/GeneralLaws/PartI/TitleX/Chapter66/Section10", "https://www.sec.state.ma.us/divisions/archives/download/MA_Statewide_Records_Retention_Schedule_03_26_2026.pdf", "https://www.sec.state.ma.us/divisions/corporations/general-information/corporations-corporate-transparency.htm"],
  AZ: ["https://www.azcc.gov/public-records-request", "https://azcc.gov/docs/default-source/corps-files/forms/m027-database-extraction-request.pdf?sfvrsn=73637fee_4", "https://www.azcc.gov/faqs", "https://azcc.gov/docs/default-source/corps-files/fee-schedules/fee-schedule-corporations6def4cc74b1a47129d16c2b1c3851bda.pdf", "https://www.azleg.gov/ars/39/00121-03.htm", "https://azcc.gov/corporations", "https://www.azcc.gov/corporations/notices", "https://webprod.azcc.gov/", "https://www.azcc.gov/privacy-policy"],
};
const QUEUE_7_CANDIDATES = {
  MD: { publisher: "Maryland State Department of Assessments and Taxation through SpecPrint", product: "Corporate Master File / Corporate File", availability: "paid historical master with monthly creation and weekly subscription delivery; FTP is preferred and advance payment is required", price: "$2,100 per Corporate File; published weekly-subscription pricing is unresolved; listed media and shipping charges are included" },
  MO: { publisher: "Missouri Secretary of State, Business Services Division, Corporations Unit", product: "corporate bulk data downloads", availability: "an official report confirms implementation, but the current service catalog publishes no bulk order route, delivery mechanism, agreement, or current technical contract", price: "Unknown; no current product price is published" },
  IN: { publisher: "Indiana Secretary of State, Business Services Division", product: "INBiz Business Entity Bulk Data", availability: "account-gated monthly full snapshot delivered by USB, with separately selected downloadable monthly differential updates", price: "$8,000 one-time, or $9,500 baseline-plus-subscription eligibility plus $500 for each selected monthly update" },
  SC: { publisher: "South Carolina Secretary of State through South Carolina Interactive / SC.gov", product: "Corporation Bulk Data", availability: "paid monthly CSV archives pushed to a subscriber-provided FTP endpoint on the fifth of each month; signed SCI registration, ACH Auto Pay, and state-fiscal-year access required", price: "$12,000 per state fiscal year plus the $125 annual SCI subscription; no proration or refunds" },
};
const QUEUE_7_COVERAGE = {
  MD: { reported_profiles: 132909, coordinate_profiles: 5141, nonemployer_baseline_2023: 599050, baseline_minus_profiles: 466141, diagnostic_profile_percent: 22.2, material_zctas: 484, zctas_with_record_level_evidence: 480 },
  MO: { reported_profiles: 94218, coordinate_profiles: 7351, nonemployer_baseline_2023: 485486, baseline_minus_profiles: 391268, diagnostic_profile_percent: 19.4, material_zctas: 1041, zctas_with_record_level_evidence: 1028 },
  IN: { reported_profiles: 112961, coordinate_profiles: 7347, nonemployer_baseline_2023: 486290, baseline_minus_profiles: 373329, diagnostic_profile_percent: 23.2, material_zctas: 807, zctas_with_record_level_evidence: 798 },
  SC: { reported_profiles: 81827, coordinate_profiles: 6345, nonemployer_baseline_2023: 445689, baseline_minus_profiles: 363862, diagnostic_profile_percent: 18.4, material_zctas: 425, zctas_with_record_level_evidence: 419 },
};
const QUEUE_7_URLS = {
  MD: ["https://dat.maryland.gov/Pages/Services.aspx", "https://www.specprint.com/state_prc.html", "https://specprint.com/spec/CORP%20FILE%20LAYOUT.pdf", "https://specprint.com/spec/TOF.pdf", "https://dat.maryland.gov/SiteAssets/Pages/sdatforms/2026%20Form%201%20Instructions%20%20FINAL.pdf", "https://egov.maryland.gov/businessexpress/entitysearch", "https://dat.maryland.gov/Documents/Accessible%20Documents/Charter%20-%20Resource%20Docs/What%20it%20means%20when%20a%20business%20is%20Not%20in%20Good%20Standing%20or%20Forfeited%20-%20Entity%20Status_0326-A.pdf", "https://dat.maryland.gov/about/Pages/Website-Usage-Statements.aspx", "https://mgaleg.maryland.gov/mgawebsite/laws/StatuteText?article=ggp&section=4-205"],
  MO: ["https://www.sos.mo.gov/CMSImages/SOSMain/AshcroftAdministrationAccomplishments.pdf", "https://www.sos.mo.gov/CMSImages/NewsReleases/OfficeCalendarYear2023.pdf", "https://www.sos.mo.gov/business/formsAndServices", "https://revisor.mo.gov/main/OneSection.aspx?section=610.026", "https://revisor.mo.gov/main/OneSection.aspx?section=610.029", "https://www.sos.mo.gov/business/corporations", "https://www.sos.mo.gov/business/corporations/faqs.asp", "https://www.sos.mo.gov/business/corporations/about.asp", "https://www.sos.mo.gov/CMSImages/Business/BRSGuides/SearchingforEntitiy.pdf", "https://www.sos.mo.gov/business/corporations/fictitious_faq", "https://www.sos.mo.gov/business/corporations/generalInfo", "https://oa.mo.gov/sites/default/files/2021-State-Projects-Report.pdf", "https://www.sos.mo.gov/bsd/RegSysFAQ", "https://www.sos.mo.gov/ipolicy", "https://www.sos.mo.gov/business/corporations/contact.asp"],
  IN: ["https://inbiz.in.gov/inbiz/bulkdataservices/index", "https://www.in.gov/sos/business/files/Regulatory-Analysis-Business-Entity-Bulk-Data-Fees-LSA-25-155-OMB-2025-01R.pdf", "https://inbiz.in.gov/business-filings/business-entityreport", "https://www.in.gov/sos/files/2025-InBiz-Legislative-Council-Report-Business-One-Stop-10-31-25.pdf", "https://inbiz.in.gov/business-filings/admin-dissolution", "https://bsd.sos.in.gov/publicbusinesssearch", "https://www.in.gov/sos/business/hb-1593-and-hb-1666-filing-process-changes/", "https://www.in.gov/core/terms_of_use.html", "https://www.in.gov/sos/business/files/New-INBiz-FAQs.pdf", "https://www.in.gov/pla/license/download-license-files/"],
  SC: ["https://scdgs.sc.gov/sites/scdgs/files/Documents/06252025_SC_Subscriber_Agreement.pdf", "https://www.sos.sc.gov/online-filings/business-entities", "https://www.sos.sc.gov/online-filings/business-entities/file-and-search-online", "https://businessfilings.sc.gov/businessfiling/Home", "https://sos.sc.gov/faqs-about-business-entities", "https://sos.sc.gov/node/39", "https://sos.sc.gov/sites/sos/files/Documents/About%20Us/Secretary_of_State_FY%202025_Annual_AccountabilityReport.pdf", "https://www.scstatehouse.gov/code/t33c005.php", "https://www.scstatehouse.gov/code/t33c044.php"],
};

QUEUE_SCOPES.set("state-business-source-discovery-queue-5-wave-1-2026-09-03", {
  scope: ["OH", "NC", "NJ", "VA"],
  candidates: QUEUE_5_CANDIDATES,
  coverage: QUEUE_5_COVERAGE,
  urls: QUEUE_5_URLS,
  parallel: true,
  assignments: QUEUE_5_ASSIGNMENTS,
  waves: QUEUE_5_WAVES,
  forbiddenOperations: QUEUE_5_FORBIDDEN_OPERATIONS,
  excludedDataClasses: QUEUE_5_EXCLUDED_DATA_CLASSES,
  contentDigest: "53fc79da69415079c5ad518e1982917eb822436f572975bb7e34944af9e67f61",
});
QUEUE_SCOPES.set("state-business-source-discovery-queue-6-wave-1-2026-09-03", {
  scope: ["MI", "TN", "MA", "AZ"],
  candidates: QUEUE_6_CANDIDATES,
  coverage: QUEUE_6_COVERAGE,
  urls: QUEUE_6_URLS,
  parallel: true,
  assignments: QUEUE_6_ASSIGNMENTS,
  waves: QUEUE_6_WAVES,
  forbiddenOperations: QUEUE_5_FORBIDDEN_OPERATIONS,
  excludedDataClasses: QUEUE_6_EXCLUDED_DATA_CLASSES,
  contentDigest: "7b25e28bcbd11ec0fc4a3344ce8895d6d4aef35482f1614dc3cb657c5a74e0d8",
});
QUEUE_SCOPES.set("state-business-source-discovery-queue-7-wave-1-2026-09-03", {
  scope: ["MD", "MO", "IN", "SC"],
  candidates: QUEUE_7_CANDIDATES,
  coverage: QUEUE_7_COVERAGE,
  urls: QUEUE_7_URLS,
  parallel: true,
  assignments: QUEUE_7_ASSIGNMENTS,
  waves: QUEUE_7_WAVES,
  forbiddenOperations: QUEUE_5_FORBIDDEN_OPERATIONS,
  excludedDataClasses: QUEUE_6_EXCLUDED_DATA_CLASSES,
  contentDigest: "e3d4baaa2c23c9eb13798bb201180f2735e6b57a2b07bc0c980962e4614b9bb4",
});

function fail(message) {
  throw new Error(`State-source discovery queue is invalid: ${message}`);
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function exactDate(value) {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(value ?? "")) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function roundedPercent(numerator, denominator) {
  return Number(((numerator / denominator) * 100).toFixed(1));
}

function safeChild(rootDirectory, candidate, label) {
  const resolved = path.resolve(rootDirectory, candidate);
  const relative = path.relative(rootDirectory, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail(`${label} escapes its governed directory`);
  return resolved;
}

export async function loadVerifiedStateCoverageRows(
  pointer,
  coverageRoot = path.join(ROOT, "data", "business-coverage-views"),
) {
  const manifestPath = safeChild(coverageRoot, pointer.manifest, "current coverage manifest");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.dataset_id !== pointer.dataset_id || manifest.release_id !== pointer.release_id) fail("current coverage manifest identity drifted");
  const artifact = manifest.artifacts?.find((candidate) => candidate.artifact_type === "state-coverage-view-jsonl");
  if (!artifact) fail("current coverage release has no state view");
  const statePath = safeChild(path.dirname(manifestPath), artifact.path, "state coverage artifact");
  const stateBytes = await readFile(statePath);
  const digest = createHash("sha256").update(stateBytes).digest("hex");
  if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes !== stateBytes.byteLength || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? "") || artifact.sha256 !== digest) fail("state coverage artifact integrity drifted");
  const rows = stateBytes.toString("utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  if (rows.length !== artifact.record_count) fail("state coverage artifact count drifted");
  return rows;
}

function coverageFromStateRow(row) {
  const reportedProfiles = row.registry_evidence?.reported_address_profile_count;
  const baseline = row.nonemployer_baseline?.nonemployer_establishments;
  return {
    reported_profiles: reportedProfiles,
    coordinate_profiles: row.registry_evidence?.coordinate_assigned_profile_count,
    nonemployer_baseline_2023: baseline,
    baseline_minus_profiles: baseline - reportedProfiles,
    diagnostic_profile_percent: roundedPercent(reportedProfiles, baseline),
    material_zctas: row.zcta_coverage?.material_intersecting_zcta_count,
    zctas_with_record_level_evidence: row.zcta_coverage?.zctas_with_record_level_source_contribution,
  };
}

function validateRankedSelection(queue, expectedQueueId, queueLabel, stateRows, priorStateAbbreviations) {
  if (queue?.queue_id !== expectedQueueId) fail(`ranked selection requires ${queueLabel}`);
  for (const state of queue.states) {
    const sourceRow = stateRows.find((row) => row.postal_abbreviation === state.state_abbreviation);
    if (!sourceRow || JSON.stringify(state.current_coverage) !== JSON.stringify(coverageFromStateRow(sourceRow))) fail(`${queueLabel} ${state.state_abbreviation} coverage does not match the current state view`);
  }
  const prior = new Set(priorStateAbbreviations);
  const ranked = stateRows
    .filter((row) => row.is_50_states_or_dc
      && assessStateBusinessSourceReadiness(row).source_scope_status === "national-sector-layers-only"
      && !prior.has(row.postal_abbreviation)
      && Number.isSafeInteger(row.nonemployer_baseline?.nonemployer_establishments))
    .map((row) => ({
      state_abbreviation: row.postal_abbreviation,
      gap: row.nonemployer_baseline.nonemployer_establishments - row.registry_evidence.reported_address_profile_count,
    }))
    .sort((left, right) => right.gap - left.gap || left.state_abbreviation.localeCompare(right.state_abbreviation));
  const expectedScope = ranked.slice(0, queue.scope.length).map((row) => row.state_abbreviation);
  if (JSON.stringify(queue.scope) !== JSON.stringify(expectedScope)) fail(`${queueLabel} is not the next ranked eligible state wave`);
  return queue;
}

export function validateQueue6RankedSelection(queue, stateRows, priorStateAbbreviations) {
  return validateRankedSelection(queue, QUEUE_6_ID, "Queue 6", stateRows, priorStateAbbreviations);
}

export function validateQueue7RankedSelection(queue, stateRows, priorStateAbbreviations) {
  return validateRankedSelection(queue, QUEUE_7_ID, "Queue 7", stateRows, priorStateAbbreviations);
}

export function validateStateBusinessSourceDiscoveryQueue(queue) {
  if (queue?.schema_version !== "1.0.0") fail("unsupported schema version");
  const queueSpec = QUEUE_SCOPES.get(queue?.queue_id);
  if (!queueSpec) fail("unexpected queue identity");
  const expectedScope = queueSpec.scope;
  if (!exactDate(queue?.observed_at) || !queue.queue_id.endsWith(queue.observed_at)) fail("observation date is invalid or does not match the queue identity");
  if (queue?.coverage_release_id !== EXPECTED_COVERAGE_RELEASE_ID) fail("coverage release is not pinned");
  if (JSON.stringify(queue?.scope) !== JSON.stringify(expectedScope)) fail("scope must preserve the ranked state wave");
  if (queue?.controls?.official_primary_sources_only !== true) fail("official-source boundary is missing");
  for (const field of ZERO_ACTION_CONTROLS) if (queue?.controls?.[field] !== 0) fail(`${field} must remain zero`);
  if (queue.queue_id.endsWith("wave-3-2026-09-03")) {
    if (queue.controls.bounded_source_streams_opened !== 1 || queue.controls.bounded_source_stream_byte_cap !== 81616 || queue.controls.bounded_source_stream_bytes_read !== 81616 || queue.controls.bounded_source_streams_saved !== 0 || queue.controls.individual_source_records_persisted !== 0) fail("bounded source-stream accounting drifted");
    if (JSON.stringify(queue.allowed_operations) !== JSON.stringify(WAVE_3_ALLOWED_OPERATIONS) || JSON.stringify(queue.forbidden_operations) !== JSON.stringify(WAVE_3_FORBIDDEN_OPERATIONS)) fail("wave 3 operation boundary drifted");
  }
  if (queueSpec.parallel) {
    if (queue.controls.record_level_data_requested !== false) fail("Parallel queue record-level request boundary drifted");
    if (JSON.stringify(queue.forbidden_operations) !== JSON.stringify(queueSpec.forbiddenOperations)) fail("Parallel queue forbidden operation boundary drifted");
    if (JSON.stringify(queue.required_excluded_data_classes) !== JSON.stringify(queueSpec.excludedDataClasses)) fail("Parallel queue excluded data classes drifted");
    if (queue.parallel_execution?.non_overlapping_state_assignments !== true || queue.parallel_execution?.maximum_active_workstreams !== 4) fail("Parallel queue workstream controls drifted");
    if (JSON.stringify(queue.parallel_execution.assignments) !== JSON.stringify(queueSpec.assignments) || JSON.stringify(queue.parallel_execution.waves) !== JSON.stringify(queueSpec.waves)) fail("Parallel queue execution evidence drifted");
    const assigned = queue.parallel_execution.assignments.map((assignment) => assignment.state_abbreviation);
    if (new Set(assigned).size !== assigned.length || JSON.stringify(assigned) !== JSON.stringify(expectedScope) || queue.parallel_execution.waves.some((wave) => wave.concurrent_state_abbreviations.length > queue.parallel_execution.maximum_active_workstreams)) fail("Parallel queue assignments overlap or exceed the workstream limit");
  }
  if (!Array.isArray(queue?.states) || queue.states.length !== expectedScope.length) fail("state count does not match scope");

  const seen = new Set();
  let previousGap = Number.POSITIVE_INFINITY;
  for (const [index, state] of queue.states.entries()) {
    if (state.rank !== index + 1 || state.state_abbreviation !== expectedScope[index]) fail(`state rank ${index + 1} drifted`);
    if (seen.has(state.state_abbreviation)) fail(`duplicate state ${state.state_abbreviation}`);
    seen.add(state.state_abbreviation);
    if (!nonblank(state.state_name) || !nonblank(state.candidate?.publisher) || !nonblank(state.candidate?.product) || !nonblank(state.candidate?.availability)) fail(`${state.state_abbreviation} candidate identity is incomplete`);
    const expectedDecision = queueSpec.decisions?.[index] ?? "hold";
    const implementationAuthorized = expectedDecision === "proceed-to-bounded-connector";
    const expectedNextActionType = implementationAuthorized ? "bounded-connector-implementation" : "written-preflight-inquiry";
    if (state.decision !== expectedDecision || (state.bounded_connector_implementation_authorized ?? false) !== implementationAuthorized || (state.authorized_next_action_type ?? expectedNextActionType) !== expectedNextActionType || state.autonomous_acquisition_authorized !== false || state.paid_acquisition_authorized !== false || state.broad_layer_production_ready !== false) fail(`${state.state_abbreviation} authorization boundary drifted`);
    if (queueSpec.parallel && (state.complete_source_acquisition_authorized !== false || state.row_bearing_preflight_authorized !== false || state.offline_fixture_connector_authorized !== false || state.production_ready !== false)) fail(`${state.state_abbreviation} extended authorization boundary drifted`);
    const coverage = state.current_coverage;
    for (const field of ["reported_profiles", "coordinate_profiles", "nonemployer_baseline_2023", "material_zctas"]) {
      if (!Number.isSafeInteger(coverage?.[field]) || coverage[field] < 0) fail(`${state.state_abbreviation} ${field} is invalid`);
    }
    if (!Number.isSafeInteger(coverage?.baseline_minus_profiles)) fail(`${state.state_abbreviation} baseline_minus_profiles is invalid`);
    if (coverage.baseline_minus_profiles !== coverage.nonemployer_baseline_2023 - coverage.reported_profiles) fail(`${state.state_abbreviation} diagnostic gap does not reconcile`);
    if (coverage.diagnostic_profile_percent !== roundedPercent(coverage.reported_profiles, coverage.nonemployer_baseline_2023)) fail(`${state.state_abbreviation} diagnostic percent does not reconcile`);
    if (coverage.baseline_minus_profiles > previousGap) fail("states are not ranked by descending diagnostic gap");
    previousGap = coverage.baseline_minus_profiles;
    if (queueSpec.coverage && JSON.stringify(coverage) !== JSON.stringify(queueSpec.coverage[state.state_abbreviation])) fail(`${state.state_abbreviation} pinned coverage evidence drifted`);
    if (queueSpec.candidates && JSON.stringify(state.candidate) !== JSON.stringify(queueSpec.candidates[state.state_abbreviation])) fail(`${state.state_abbreviation} candidate identity drifted`);
    if (!Array.isArray(state.official_urls) || state.official_urls.length < 2 || state.official_urls.some((url) => !/^https:\/\//.test(url))) fail(`${state.state_abbreviation} official evidence is incomplete`);
    if (queueSpec.urls && JSON.stringify(state.official_urls) !== JSON.stringify(queueSpec.urls[state.state_abbreviation])) fail(`${state.state_abbreviation} official evidence URLs drifted`);
    if (queueSpec.parallel && (!Array.isArray(state.observed_evidence) || state.observed_evidence.length < 4 || state.observed_evidence.some((item) => !nonblank(item)))) fail(`${state.state_abbreviation} observed evidence is incomplete`);
    const expectedGates = queueSpec.gates?.[state.state_abbreviation] ?? REQUIRED_GATES;
    if (JSON.stringify(state.unresolved_gates) !== JSON.stringify(expectedGates)) fail(`${state.state_abbreviation} unresolved gates drifted`);
    if (!Array.isArray(state.required_exclusions) || state.required_exclusions.length < 4) fail(`${state.state_abbreviation} privacy exclusions are incomplete`);
    if (!nonblank(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action is missing`);
    if (implementationAuthorized && !/require explicit authorization before/i.test(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action omits the full-acquisition authorization boundary`);
    if (!implementationAuthorized && !/\bdo not\b/i.test(state.strongest_bounded_next_action)) fail(`${state.state_abbreviation} next action omits the hold boundary`);
  }
  const contentDigest = createHash("sha256").update(JSON.stringify(queue)).digest("hex");
  if (contentDigest !== queueSpec.contentDigest) fail(`${queue.queue_id} content digest drifted`);
  return queue;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const queues = [];
  for (const queuePath of QUEUE_PATHS) queues.push(validateStateBusinessSourceDiscoveryQueue(JSON.parse(await readFile(queuePath, "utf8"))));
  for (const queue of queues) console.log(`State-source discovery ${queue.queue_id}: PASS`);
  const states = queues.flatMap((queue) => queue.states);
  console.log(`Waves: ${queues.length}; states: ${states.length}; autonomous acquisitions authorized: ${states.filter((state) => state.autonomous_acquisition_authorized).length}; production-ready broad layers: ${states.filter((state) => state.broad_layer_production_ready).length}`);
  const revalidation = await loadStateBusinessSourceRevalidation(DEFAULT_STATE_BUSINESS_SOURCE_REVALIDATION_PATH);
  const currentCoveragePointer = JSON.parse(await readFile(CURRENT_COVERAGE_POINTER_PATH, "utf8"));
  if (currentCoveragePointer.dataset_id !== "national-business-coverage-views" || !/^national-business-coverage-views-/.test(currentCoveragePointer.release_id ?? "")) fail("current coverage pointer is invalid");
  if (currentCoveragePointer.release_id !== EXPECTED_COVERAGE_RELEASE_ID || queues.some((queue) => queue.coverage_release_id !== currentCoveragePointer.release_id)) fail("discovery queue coverage release does not match the current production pointer");
  const stateRows = await loadVerifiedStateCoverageRows(currentCoveragePointer);
  for (const [queueId, queueLabel, validator] of [
    [QUEUE_6_ID, "Queue 6", validateQueue6RankedSelection],
    [QUEUE_7_ID, "Queue 7", validateQueue7RankedSelection],
  ]) {
    const queueIndex = queues.findIndex((queue) => queue.queue_id === queueId);
    const queue = queues[queueIndex];
    const priorStateAbbreviations = [
      ...revalidation.states.map((state) => state.state_abbreviation),
      ...queues.slice(0, queueIndex).flatMap((candidate) => candidate.scope),
    ];
    validator(queue, stateRows, priorStateAbbreviations);
    console.log(`Ranked ${queueLabel} selection: PASS (${queue.scope.join(", ")})`);
  }
  const summary = summarizeStateBusinessSourceRevalidation(revalidation, currentCoveragePointer.release_id);
  if (summary.coverage_release_matches_current !== true) fail("revalidation coverage release does not match the current production pointer");
  console.log(`State-source revalidation ${summary.revalidation_id}: PASS`);
  console.log(`Revalidated: ${summary.jurisdictions_revalidated}; holds: ${summary.hold_decisions}; bounded connectors: ${summary.bounded_connector_decisions}; autonomous acquisitions authorized: ${summary.autonomous_acquisitions_authorized}; production-ready: ${summary.production_ready_jurisdictions}`);
}
