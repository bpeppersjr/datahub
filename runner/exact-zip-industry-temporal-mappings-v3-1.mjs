export const TEMPORAL_MAPPINGS_V31 = Object.freeze([
  ["cms_hospital_directory", "cms-hospital-directory", "CMS hospital directory row; directory membership is not verified current operation"],
  ["cms_nursing_home_directory", "cms-nursing-home-directory", "CMS nursing-home directory row; directory membership is not verified current operation"],
  ["childcare_pa_candidates", "pa-childcare-centers", "Pennsylvania retained childcare candidate row; not a verified active business"],
  ["childcare_ct_candidates", "ct-childcare-centers", "Connecticut retained childcare candidate row; not a verified active business"],
  ["childcare_md_candidates", "md-childcare-centers", "Maryland retained childcare candidate row; not a verified active business"],
  ["childcare_vt_candidates", "vt-childcare-centers", "Vermont retained childcare candidate row; not a verified active business"],
  ["childcare_co_candidates", "co-childcare-centers", "Colorado retained childcare candidate row; not a verified active business"],
  ["childcare_ut_candidates", "ut-childcare-centers", "Utah retained childcare candidate row; publisher reference time remains unresolved"],
  ["childcare_ia_candidates", "ia-childcare-centers", "Iowa retained childcare candidate row; publisher reference time remains unresolved"],
  ["mn_residential_construction_credential_reported_address_rows", "mn-residential-construction-credentials", "Minnesota publisher credential row at a reported address; not a unique business or verified operating site"],
].map(([dimension_id, source_key, source_status_term]) => Object.freeze({ dimension_id, source_key, source_status_term })));

export const TEMPORAL_MAPPING_BY_ID_V31 = new Map(TEMPORAL_MAPPINGS_V31.map((row) => [row.dimension_id, row]));
