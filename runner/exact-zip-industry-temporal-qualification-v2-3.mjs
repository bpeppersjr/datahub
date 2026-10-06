import { readExactZipIndustryEvidenceWithTemporalQualificationV22 as prior } from './exact-zip-industry-temporal-qualification-v2-2.mjs';
import { readExactZipIndustryEvidenceV23 as matrix } from './national-exact-zip-industry-evidence-matrix-v2-3-reader.mjs';
import { classifyExactZipEvidenceDispositionV23 as classify } from './exact-zip-evidence-disposition-v2-3.mjs';
const ID='cross_source_entity_resolution_linkage_evidence';
export async function readExactZipIndustryEvidenceWithTemporalQualificationV23(options={}) {
  const [p,m]=await Promise.all([prior(options),matrix(options)]),cell=m.row?.cells?.[ID],raw=cell?.status==='positive'?'retained-linkage-evidence-row':'no-retained-linkage-decisions';
  const q={dimension_id:ID,source_key:'zip-entity-resolution-evidence',source_release_id:cell?.source_release_id??'zip-entity-resolution-evidence-576079155175db7c5abbedf9a81c5481c53294cfd74cfd23fa994b2decd67564',semantic_class:'linkage-readiness',review_qualification:'unmeasured',source_reference_at:null,assessment_as_of:p.temporal_qualification.assessment_as_of,current_operations_verified:false,identity_merge_applied:false,evidence_disposition:classify({raw_status:raw,semantic_class:'linkage-readiness',review_qualification:'unmeasured'})};
  return {...m,source_metadata:p.source_metadata,status_counts:p.status_counts,cell_status_counts_by_dimension:p.cell_status_counts_by_dimension,temporal_qualification:{...p.temporal_qualification,schema_version:'exact-zip-industry-temporal-qualification-view@2.3.0',rows:[...p.temporal_qualification.rows,q],summary:{...p.temporal_qualification.summary,dimension_count:44,qualification_cell_total:2120536,semantic_cell_total:2120536},claims:{...p.temporal_qualification.claims,identity_merges:false}}};
}
