/**
 * src/blocks/registry_extra_b.js  — EXTRA BLOCKS PART B
 * ──────────────────────────────────────────────────────
 * Additional blocks for existing categories.
 *
 * EXPANDED (Part B):
 *   chemistry   — +14
 *   biology     — +14
 *   ml          — +20
 *   physics     — +14
 *   materials   — +10
 *   drug        — +8
 *   genai       — +14
 *   math        — +10
 *   output      — +10
 *   api         — +10
 *   transform   — +8
 *   utility     — +10
 *   variable    — +4
 *   logging     — +4
 */

const ps   = (key,label,val='',desc='')                  => ({key,label,type:'string', value:val,default:val,description:desc});
const pn   = (key,label,val=0,min=null,max=null,desc='') => ({key,label,type:'number', value:val,default:val,min,max,description:desc});
const pa   = (key,label,val=0,desc='')                   => ({key,label,type:'angle',  value:val,default:val,min:0,max:Math.PI*2,description:desc});
const pb   = (key,label,val=false,desc='')               => ({key,label,type:'bool',   value:val,default:val,description:desc});
const psel = (key,label,opts,val,desc='')                => ({key,label,type:'select', options:opts,value:val||opts[0],default:val||opts[0],description:desc});
const pc   = (key,label,val='',desc='')                  => ({key,label,type:'code',   value:val,default:val,description:desc});
const pj   = (key,label,val='{}',desc='')                => ({key,label,type:'json',   value:val,default:val,description:desc});

const qIn  = (id='qi',l='Qubit in')     => ({id,dir:'in', dt:'qubit',    label:l});
const qOut = (id='qo',l='Qubit out')    => ({id,dir:'out',dt:'qubit',    label:l});
const rIn  = (id='ri',l='Register in')  => ({id,dir:'in', dt:'register', label:l});
const rOut = (id='ro',l='Register out') => ({id,dir:'out',dt:'register', label:l});
const cIn  = (id='ci',l='In')           => ({id,dir:'in', dt:'classical',label:l});
const cOut = (id='co',l='Out')          => ({id,dir:'out',dt:'classical',label:l});
const aIn  = (id='ai',l='In')           => ({id,dir:'in', dt:'any',      label:l});
const aOut = (id='ao',l='Out')          => ({id,dir:'out',dt:'any',      label:l});
const pq   = (key,label,val=0,desc='')                   => ({key,label,type:'qubit',  value:val,default:val,description:desc});
const BYPASS = [pb('bypass','Bypass',false), pb('code_override','Override',false), pc('override_code','Custom .sq','')];

export const EXTRA_BLOCKS_B = [

  // ── CHEMISTRY +14 ─────────────────────────────────────────────────────
  {
    id:'excited_state_vqe', label:'Excited State VQE', cat:'chemistry', color:'#059669', icon:'VQE*',
    info:'Compute excited states via Multistate Contracted VQE or equation-of-motion.',
    params:[ps('mol_var','Molecule','mol'), pn('n_states','Number of states',3,2,20), psel('method','Method',['MC-VQE','EOM-CCSD','SA-CASSCF'],'MC-VQE'), ps('output_var','Excited energies','excited_E'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('energies')],
    toSq: p=>`let ${p.output_var} = excited_vqe(${p.mol_var}, n=${p.n_states})`,
  },
  {
    id:'active_space', label:'Active Space', cat:'chemistry', color:'#059669', icon:'CAS',
    info:'Define CASSCF/CASCI active space for multireference calculations.',
    params:[ps('mol_var','Molecule','mol'), pn('n_electrons','Active electrons',2,2,50), pn('n_orbitals','Active orbitals',2,2,50), psel('method','Method',['CASSCF','CASCI','NEVPT2','DMRGSCF'],'CASSCF'), ps('output_var','Active space result','cas_result'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('energy'), cOut('orbitals')],
    toSq: p=>`let ${p.output_var} = active_space(${p.mol_var}, ne=${p.n_electrons}, no=${p.n_orbitals})`,
  },
  {
    id:'vibrational_modes', label:'Vibrational Analysis', cat:'chemistry', color:'#059669', icon:'VIB',
    info:'Normal mode analysis: frequencies, zero-point energy, thermochemistry.',
    params:[ps('mol_var','Optimised molecule','mol'), ps('hessian_method','Hessian method','DFT'), pb('compute_thermo','Thermochemistry',true), pn('temperature_K','Temperature (K)',298.15,0,5000), ps('output_var','Vibrational modes','vib_modes'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('frequencies'), cOut('zpe')],
    toSq: p=>`let ${p.output_var} = vibrational_modes(${p.mol_var})`,
  },
  {
    id:'solvation_block', label:'Solvation Model', cat:'chemistry', color:'#059669', icon:'H₂O',
    info:'Implicit solvation: PCM, SMD, COSMO. Compute solvation free energy.',
    params:[ps('mol_var','Molecule','mol'), psel('model','Solvation model',['PCM','SMD','COSMO','COSMO-RS'],'SMD'), ps('solvent','Solvent','water'), ps('output_var','Solvated result','solvated_mol'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('solvation_energy'), aOut('solvated_mol')],
    toSq: p=>`let ${p.output_var} = solvate(${p.mol_var}, model="${p.model}", solvent="${p.solvent}")`,
  },
  {
    id:'nbo_analysis', label:'NBO Analysis', cat:'chemistry', color:'#059669', icon:'NBO',
    info:'Natural Bond Orbital analysis: bond orders, charges, hyperconjugation.',
    params:[ps('mol_var','Molecule','mol'), pb('compute_wiberg','Wiberg bond orders',true), ps('output_var','NBO result','nbo_result'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('charges'), cOut('bond_orders')],
    toSq: p=>`let ${p.output_var} = nbo_analysis(${p.mol_var})`,
  },
  {
    id:'td_dft', label:'TD-DFT Excited States', cat:'chemistry', color:'#059669', icon:'TDDFT',
    info:'Time-dependent DFT for UV-Vis absorption spectra and excited states.',
    params:[ps('mol_var','Molecule','mol'), pn('n_states','Excited states',10,1,100), psel('functional','Functional',['B3LYP','CAM-B3LYP','PBE0','wB97X'],'CAM-B3LYP'), ps('output_var','Spectrum','uv_vis'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('spectrum'), cOut('oscillator_strengths')],
    toSq: p=>`let ${p.output_var} = td_dft(${p.mol_var}, n=${p.n_states})`,
  },
  {
    id:'gfn_xtb', label:'GFN-xTB Semiempirical', cat:'chemistry', color:'#059669', icon:'xTB',
    info:'Fast semiempirical GFN2-xTB for geometry optimisation and MD of large molecules.',
    params:[ps('mol_var','Molecule','mol'), psel('method','Method',['GFN2-xTB','GFN1-xTB','GFN0-xTB','DFTB3'],'GFN2-xTB'), psel('task','Task',['singlepoint','optimize','md','hessian'],'optimize'), ps('output_var','xTB result','xtb_result'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('energy'), aOut('optimized_mol')],
    toSq: p=>`let ${p.output_var} = xtb(${p.mol_var}, method="${p.method}", task="${p.task}")`,
  },
  {
    id:'conformer_gen', label:'Conformer Generation', cat:'chemistry', color:'#059669', icon:'CONF',
    info:'Generate 3D conformers: RDKit ETKDG, OpenBabel, OMEGA.',
    params:[ps('smiles_var','SMILES or molecule','mol'), pn('n_conformers','Conformers',100,1,10000), psel('method','Method',['ETKDG','ETKDGv3','OMEGA','MacroModel'],'ETKDGv3'), pn('rmsd_threshold','RMSD threshold (Å)',0.5,0.01,5), ps('output_var','Conformers','conformers'), ...BYPASS],
    inputs:[cIn('mol')], outputs:[aOut('conformers')],
    toSq: p=>`let ${p.output_var} = gen_conformers(${p.smiles_var}, n=${p.n_conformers})`,
  },
  {
    id:'fp_similarity_screen', label:'Fingerprint Screening', cat:'chemistry', color:'#059669', icon:'FPS',
    info:'Screen large compound libraries by fingerprint similarity to query.',
    params:[ps('query_mol','Query molecule','query'), ps('library_var','Library','library'), psel('fingerprint','Fingerprint',['Morgan','ECFP4','MACCS','RDKit','TopTorsion'],'ECFP4'), pn('similarity_threshold','Threshold',0.7,0,1), ps('output_var','Hits','fp_hits'), ...BYPASS],
    inputs:[aIn('query'), aIn('library')], outputs:[cOut('hits')],
    toSq: p=>`let ${p.output_var} = fp_screen(${p.query_mol}, ${p.library_var}, cutoff=${p.similarity_threshold})`,
  },
  {
    id:'scaffold_decomp', label:'Scaffold Decomposition', cat:'chemistry', color:'#059669', icon:'SCAF',
    info:'Bemis-Murcko scaffold decomposition for compound series analysis.',
    params:[ps('mol_var','Molecule or library','mol'), pb('generic_scaffold','Generic scaffold',false), ps('output_var','Scaffold','scaffold'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('scaffold'), cOut('sidechains')],
    toSq: p=>`let ${p.output_var} = scaffold_decomp(${p.mol_var})`,
  },
  {
    id:'retrosynthesis', label:'Retrosynthesis', cat:'chemistry', color:'#059669', icon:'RETRO',
    info:'AI-guided retrosynthetic route planning: ASKCOS, AiZynthFinder.',
    params:[ps('target_smiles','Target SMILES',''), psel('engine','Engine',['ASKCOS','AiZynthFinder','MCTS'],'AiZynthFinder'), pn('max_steps','Max synthetic steps',5,1,20), ps('output_var','Routes','synth_routes'), ...BYPASS],
    inputs:[cIn('target')], outputs:[cOut('routes')],
    toSq: p=>`let ${p.output_var} = retrosynthesis("${p.target_smiles}", engine="${p.engine}")`,
  },
  {
    id:'pharmacophore', label:'Pharmacophore Model', cat:'chemistry', color:'#059669', icon:'PHR',
    info:'3D pharmacophore fitting and virtual screening.',
    params:[ps('actives_var','Active molecules','actives'), psel('method','Method',['PHASE','LigandScout','MOE_ph4'],'LigandScout'), pn('n_features','Features',5,2,20), ps('output_var','Pharmacophore','pharmacophore'), ...BYPASS],
    inputs:[aIn('actives')], outputs:[cOut('model')],
    toSq: p=>`let ${p.output_var} = pharmacophore(${p.actives_var})`,
  },
  {
    id:'mmpdb_block', label:'Matched Molecular Pairs', cat:'chemistry', color:'#059669', icon:'MMP',
    info:'Matched Molecular Pair analysis for SAR and property prediction.',
    params:[ps('series_var','Compound series','series'), ps('property','Property','pIC50'), ps('output_var','MMP transforms','mmp_result'), ...BYPASS],
    inputs:[aIn('series')], outputs:[cOut('transforms'), cOut('delta_props')],
    toSq: p=>`let ${p.output_var} = mmp_analysis(${p.series_var}, prop="${p.property}")`,
  },
  {
    id:'solubility_pred', label:'Solubility Predictor', cat:'chemistry', color:'#059669', icon:'SOL',
    info:'Predict aqueous solubility (logS). Delaney ESOL, AqSolDB model.',
    params:[ps('mol_var','Molecule','mol'), psel('model','Model',['ESOL','AqSolDB','SolubilityGNN'],'ESOL'), ps('output_var','logS','log_solubility'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[cOut('logS')],
    toSq: p=>`let ${p.output_var} = solubility(${p.mol_var})`,
  },

  // ── BIOLOGY +14 ───────────────────────────────────────────────────────
  {
    id:'single_cell_rna', label:'scRNA-seq Analysis', cat:'biology', color:'#16A34A', icon:'scRNA',
    info:'Single-cell RNA sequencing: clustering, UMAP, marker genes.',
    params:[ps('count_matrix_var','Count matrix','counts'), psel('tool','Tool',['Seurat','Scanpy','Monocle3'],'Scanpy'), pn('n_pcs','PCs',50,5,200), pn('n_neighbors','Neighbors',15,3,100), psel('clustering','Clustering',['leiden','louvain','kmeans'],'leiden'), ps('output_var','Cell clusters','sc_result'), ...BYPASS],
    inputs:[aIn('counts')], outputs:[cOut('clusters'), cOut('umap')],
    toSq: p=>`let ${p.output_var} = scrna_analysis(${p.count_matrix_var})`,
  },
  {
    id:'drug_target_interact', label:'Drug-Target Interaction', cat:'biology', color:'#16A34A', icon:'DTI',
    info:'Predict drug-target binding affinity using graph neural networks.',
    params:[ps('drug_var','Drug SMILES/mol','drug'), ps('target_seq','Target protein sequence','protein_seq'), psel('model','Model',['DeepDTA','GraphDTA','MolTrans','Transformer-DTI'],'GraphDTA'), ps('output_var','Affinity','binding_affinity'), ...BYPASS],
    inputs:[aIn('drug'), cIn('target')], outputs:[cOut('affinity'), cOut('binding_mode')],
    toSq: p=>`let ${p.output_var} = dti(${p.drug_var}, ${p.target_seq})`,
  },
  {
    id:'snp_analysis', label:'SNP Analysis', cat:'biology', color:'#16A34A', icon:'SNP',
    info:'Single Nucleotide Polymorphism calling and GWAS analysis.',
    params:[ps('vcf_file','VCF file path','variants.vcf'), ps('reference_var','Reference genome','hg38'), psel('analysis','Analysis',['GWAS','burden_test','LD_clump','PRS'],'GWAS'), ps('phenotype_var','Phenotype','phenotype'), ps('output_var','GWAS results','gwas_result'), ...BYPASS],
    inputs:[], outputs:[cOut('results'), cOut('manhattan_data')],
    toSq: p=>`let ${p.output_var} = gwas("${p.vcf_file}", phenotype=${p.phenotype_var})`,
  },
  {
    id:'metabolomics_block', label:'Metabolomics', cat:'biology', color:'#16A34A', icon:'MET',
    info:'Identify and quantify metabolites from LC-MS/GC-MS data.',
    params:[ps('ms_data_var','MS data','ms_data'), psel('pipeline','Pipeline',['XCMS','MZmine','MetaboAnalyst'],'XCMS'), ps('reference_db','Reference DB','HMDB'), ps('output_var','Metabolites','metabolites'), ...BYPASS],
    inputs:[aIn('ms_data')], outputs:[cOut('metabolites'), cOut('pathway_enrichment')],
    toSq: p=>`let ${p.output_var} = metabolomics(${p.ms_data_var})`,
  },
  {
    id:'epigenomics_block', label:'Epigenomics', cat:'biology', color:'#16A34A', icon:'EPI',
    info:'ChIP-seq, ATAC-seq, bisulfite methylation analysis.',
    params:[ps('bam_file','BAM file path','sample.bam'), psel('assay','Assay type',['ChIP-seq','ATAC-seq','bisulfite','CUT&RUN'],'ChIP-seq'), ps('peak_caller','Peak caller','MACS2'), ps('output_var','Peaks','peaks'), ...BYPASS],
    inputs:[], outputs:[cOut('peaks'), cOut('motifs')],
    toSq: p=>`let ${p.output_var} = epigenomics("${p.bam_file}", assay="${p.assay}")`,
  },
  {
    id:'network_biology', label:'Biological Network', cat:'biology', color:'#16A34A', icon:'NET',
    info:'Protein-protein interaction network analysis: hub genes, community detection.',
    params:[ps('network_var','PPI network','ppi_network'), psel('analysis','Analysis',['centrality','community','pathway_enrichment','module_detection'],'centrality'), ps('output_var','Network result','net_result'), ...BYPASS],
    inputs:[aIn('network')], outputs:[cOut('hubs'), cOut('communities')],
    toSq: p=>`let ${p.output_var} = bio_network(${p.network_var}, analysis="${p.analysis}")`,
  },
  {
    id:'metagenomics_block', label:'Metagenomics', cat:'biology', color:'#16A34A', icon:'META',
    info:'Taxonomic and functional profiling of microbiome samples.',
    params:[ps('reads_file','Reads file','reads.fastq'), psel('tool','Pipeline',['Kraken2','MetaPhlAn4','HUMAnN3','Qiime2'],'MetaPhlAn4'), psel('analysis','Analysis',['taxonomy','diversity','functional','assembly'],'taxonomy'), ps('output_var','Profile','meta_profile'), ...BYPASS],
    inputs:[], outputs:[cOut('taxonomy'), cOut('diversity_metrics')],
    toSq: p=>`let ${p.output_var} = metagenomics("${p.reads_file}")`,
  },
  {
    id:'flow_cytometry', label:'Flow Cytometry', cat:'biology', color:'#16A34A', icon:'FACS',
    info:'Automated cell gating and population analysis from FACS data.',
    params:[ps('fcs_file','FCS file path','sample.fcs'), psel('method','Gating method',['FlowJo_manual','openCyto_auto','PhenoGraph','FlowSOM'],'FlowSOM'), ps('output_var','Cell populations','facs_result'), ...BYPASS],
    inputs:[], outputs:[cOut('populations'), cOut('counts')],
    toSq: p=>`let ${p.output_var} = flow_cytometry("${p.fcs_file}")`,
  },
  {
    id:'cryo_em_block', label:'Cryo-EM', cat:'biology', color:'#16A34A', icon:'CryoEM',
    info:'Cryo-EM structure determination: CTF correction, 2D/3D classification, refinement.',
    params:[ps('micrographs_dir','Micrographs directory','./micrographs/'), psel('software','Software',['RELION','cryoSPARC','cisTEM'],'cryoSPARC'), pn('target_resolution','Target resolution (Å)',3.0,1,20), ps('output_var','3D map','cryo_map'), ...BYPASS],
    inputs:[], outputs:[aOut('3d_map'), cOut('resolution')],
    toSq: p=>`let ${p.output_var} = cryo_em("${p.micrographs_dir}")`,
  },
  {
    id:'gene_ontology', label:'Gene Ontology Enrichment', cat:'biology', color:'#16A34A', icon:'GO',
    info:'GO/KEGG/Reactome pathway enrichment analysis.',
    params:[ps('gene_list_var','Gene list','gene_list'), ps('background_var','Background genes','background'), psel('database','Database',['GO_BP','GO_MF','KEGG','Reactome','MSigDB'],'GO_BP'), pn('fdr_threshold','FDR threshold',0.05,0,1), ps('output_var','Enriched terms','go_result'), ...BYPASS],
    inputs:[cIn('genes')], outputs:[cOut('enriched_terms'), cOut('dot_plot')],
    toSq: p=>`let ${p.output_var} = go_enrichment(${p.gene_list_var}, db="${p.database}")`,
  },
  {
    id:'haplotype_block', label:'Haplotype Phasing', cat:'biology', color:'#16A34A', icon:'HAP',
    info:'Statistical and physical haplotype phasing from sequencing data.',
    params:[ps('vcf_var','VCF file','variants.vcf'), psel('method','Phasing method',['SHAPEIT4','BEAGLE5','WhatsHap','HapCUT2'],'SHAPEIT4'), ps('output_var','Phased haplotypes','haplotypes'), ...BYPASS],
    inputs:[], outputs:[cOut('haplotypes')],
    toSq: p=>`let ${p.output_var} = haplotype_phase("${p.vcf_var}")`,
  },
  {
    id:'structural_variation', label:'Structural Variation', cat:'biology', color:'#16A34A', icon:'SV',
    info:'Detect SVs from WGS: deletions, duplications, inversions, translocations.',
    params:[ps('bam_var','BAM file','sample.bam'), ps('reference','Reference genome','hg38'), psel('caller','SV caller',['Manta','DELLY','Lumpy','PBSV'],'Manta'), ps('output_var','SV calls','sv_calls'), ...BYPASS],
    inputs:[], outputs:[cOut('sv_calls')],
    toSq: p=>`let ${p.output_var} = sv_calling("${p.bam_var}")`,
  },
  {
    id:'protein_design', label:'Protein Design', cat:'biology', color:'#16A34A', icon:'DE NOVO',
    info:'De novo protein design: ProteinMPNN, RFdiffusion, ESMFold.',
    params:[ps('target_structure','Target structure','pdb_file'), psel('method','Method',['ProteinMPNN','RFdiffusion','ESM-IF','Rosetta_FastDesign'],'ProteinMPNN'), pn('n_sequences','Sequences to design',100,1,10000), ps('output_var','Designed sequences','designed_proteins'), ...BYPASS],
    inputs:[aIn('target')], outputs:[cOut('sequences'), cOut('scores')],
    toSq: p=>`let ${p.output_var} = protein_design(${p.target_structure}, method="${p.method}")`,
  },
  {
    id:'genome_assembly', label:'Genome Assembly', cat:'biology', color:'#16A34A', icon:'ASSEM',
    info:'De novo genome assembly from short or long reads.',
    params:[ps('reads_var','Reads file(s)','reads.fastq'), psel('assembler','Assembler',['SPAdes','Flye','Hifiasm','wtdbg2'],'SPAdes'), psel('read_type','Read type',['illumina','nanopore','pacbio_hifi'],'illumina'), ps('output_var','Assembly','genome'), ...BYPASS],
    inputs:[], outputs:[cOut('contigs'), cOut('assembly_stats')],
    toSq: p=>`let ${p.output_var} = genome_assembly("${p.reads_var}")`,
  },

  // ── MACHINE LEARNING +20 ──────────────────────────────────────────────
  {
    id:'transformers_block', label:'Transformers (HuggingFace)', cat:'ml', color:'#65A30D', icon:'🤗',
    info:'Load and run any HuggingFace model: text, vision, audio, multimodal.',
    params:[ps('model_name','Model name','bert-base-uncased'), psel('task','Task',['text-classification','token-classification','text-generation','image-classification','question-answering','summarization','translation'],'text-classification'), ps('input_var','Input','text'), ps('output_var','Output','hf_result'), ...BYPASS],
    inputs:[aIn('input')], outputs:[aOut('output')],
    toSq: p=>`let ${p.output_var} = hf_pipeline("${p.task}", "${p.model_name}", ${p.input_var})`,
  },
  {
    id:'automl_block', label:'AutoML', cat:'ml', color:'#65A30D', icon:'AUTO',
    info:'Automated ML: Auto-sklearn, TPOT, AutoGluon, H2O AutoML.',
    params:[ps('X_train','Training features','X_train'), ps('y_train','Labels','y_train'), psel('tool','AutoML tool',['AutoGluon','H2O_AutoML','TPOT','auto-sklearn'],'AutoGluon'), pn('time_limit_s','Time limit (s)',3600,60,86400), psel('task','Task',['classification','regression','time_series'],'classification'), ps('output_model','Best model','automl_model'), ...BYPASS],
    inputs:[aIn('X'), aIn('y')], outputs:[aOut('model'), cOut('leaderboard')],
    toSq: p=>`let ${p.output_model} = automl(${p.X_train}, ${p.y_train}, tool="${p.tool}")`,
  },
  {
    id:'xgboost_block', label:'XGBoost', cat:'ml', color:'#65A30D', icon:'XGB',
    info:'Gradient boosted trees: XGBoost, LightGBM, CatBoost.',
    params:[ps('X_train','Features','X_train'), ps('y_train','Labels','y_train'), psel('library','Library',['XGBoost','LightGBM','CatBoost'],'LightGBM'), pn('n_estimators','Estimators',500,10,100000), pn('max_depth','Max depth',6,1,50), pn('lr','Learning rate',0.05,0.001,1), pb('early_stopping','Early stopping',true), ps('output_model','Model','gbm_model'), ...BYPASS],
    inputs:[aIn('X'), aIn('y')], outputs:[aOut('model'), cOut('feature_importance')],
    toSq: p=>`let ${p.output_model} = ${p.library.toLowerCase()}(${p.X_train}, ${p.y_train})`,
  },
  {
    id:'time_series_forecast', label:'Time Series Forecast', cat:'ml', color:'#65A30D', icon:'TS',
    info:'ARIMA, Prophet, LSTM, N-BEATS, TFT for time series forecasting.',
    params:[ps('ts_var','Time series data','ts'), psel('model','Model',['Prophet','ARIMA','LSTM','N-BEATS','TFT','NeuralProphet'],'Prophet'), pn('forecast_horizon','Forecast horizon',30,1,3650), pn('lookback','Lookback window',90,1,10000), ps('output_var','Forecast','forecast'), ...BYPASS],
    inputs:[cIn('series')], outputs:[cOut('forecast'), cOut('conf_intervals')],
    toSq: p=>`let ${p.output_var} = forecast(${p.ts_var}, model="${p.model}", horizon=${p.forecast_horizon})`,
  },
  {
    id:'anomaly_ml', label:'Anomaly Detection (ML)', cat:'ml', color:'#65A30D', icon:'⚠ML',
    info:'Unsupervised anomaly detection: Isolation Forest, OCSVM, Autoencoder, LOF.',
    params:[ps('X_var','Data','X'), psel('method','Method',['IsolationForest','OCSVM','AutoEncoder','LOF','DeepSVDD'],'IsolationForest'), pn('contamination','Contamination fraction',0.05,0.001,0.5), ps('output_var','Anomaly labels','anomalies'), ...BYPASS],
    inputs:[aIn('X')], outputs:[cOut('labels'), cOut('scores')],
    toSq: p=>`let ${p.output_var} = anomaly_detect_ml(${p.X_var}, method="${p.method}")`,
  },
  {
    id:'graph_nn', label:'Graph Neural Network', cat:'ml', color:'#65A30D', icon:'GNN',
    info:'Graph learning: GCN, GAT, GraphSAGE, GIN for molecules, social networks, KGs.',
    params:[ps('graph_var','Graph data (PyG/DGL)','graph'), psel('architecture','Architecture',['GCN','GAT','GraphSAGE','GIN','MPNN'],'GCN'), pn('hidden_dim','Hidden dim',128,4,4096), pn('n_layers','Layers',3,1,20), psel('task','Task',['node_class','graph_class','link_pred','regression'],'graph_class'), ps('output_model','Model','gnn_model'), ...BYPASS],
    inputs:[aIn('graph')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_model} = gnn(${p.graph_var}, arch="${p.architecture}")`,
  },
  {
    id:'contrastive_learn', label:'Contrastive Learning', cat:'ml', color:'#65A30D', icon:'SimCLR',
    info:'Self-supervised representation learning: SimCLR, MoCo, BYOL, DINO.',
    params:[ps('data_var','Unlabelled data','data'), psel('method','Method',['SimCLR','MoCo','BYOL','DINO','NT-Xent'],'SimCLR'), pn('projection_dim','Projection dim',128,16,2048), pn('temperature','Temperature τ',0.07,0.01,1), pn('epochs','Epochs',200,10,5000), ps('output_model','Encoder','ssl_encoder'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('encoder'), cOut('embeddings')],
    toSq: p=>`let ${p.output_model} = contrastive_train(${p.data_var}, method="${p.method}")`,
  },
  {
    id:'meta_learning', label:'Meta-Learning', cat:'ml', color:'#65A30D', icon:'MAML',
    info:'Few-shot learning: MAML, Prototypical Networks, Matching Networks.',
    params:[ps('tasks_var','Task distribution','tasks'), psel('algorithm','Algorithm',['MAML','ProtoNet','MatchingNet','Reptile','SNAIL'],'MAML'), pn('n_shot','N-shot',5,1,50), pn('n_way','N-way',5,2,50), ps('output_model','Meta model','meta_model'), ...BYPASS],
    inputs:[aIn('tasks')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_model} = meta_learn(${p.tasks_var}, algo="${p.algorithm}")`,
  },
  {
    id:'knowledge_distill', label:'Knowledge Distillation', cat:'ml', color:'#65A30D', icon:'KD',
    info:'Compress large teacher model into smaller student model.',
    params:[ps('teacher_var','Teacher model','teacher_model'), ps('student_var','Student model','student_model'), ps('X_train','Training data','X_train'), pn('temperature','Temperature',4.0,1,20), pn('alpha','Soft loss weight α',0.7,0,1), pn('epochs','Epochs',100,1,10000), ps('output_model','Distilled model','student_trained'), ...BYPASS],
    inputs:[aIn('teacher'), aIn('student'), aIn('data')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_model} = distill(${p.teacher_var}, ${p.student_var}, ${p.X_train})`,
  },
  {
    id:'federated_learn', label:'Federated Learning', cat:'ml', color:'#65A30D', icon:'FedAvg',
    info:'Privacy-preserving distributed ML: FedAvg, FedProx, SCAFFOLD.',
    params:[pj('client_data','Client data list','["client_0","client_1","client_2"]'), psel('algorithm','FL algorithm',['FedAvg','FedProx','SCAFFOLD','MOON'],'FedAvg'), pn('rounds','Communication rounds',100,1,10000), pn('local_epochs','Local epochs',5,1,100), ps('output_model','Global model','fl_model'), ...BYPASS],
    inputs:[aIn('clients')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_model} = federated_train(clients, algo="${p.algorithm}", rounds=${p.rounds})`,
  },
  {
    id:'diffusion_model', label:'Diffusion Model', cat:'ml', color:'#65A30D', icon:'DDPM',
    info:'Score-based diffusion model: DDPM, DDIM, score matching for generative modelling.',
    params:[ps('data_var','Training data','data'), psel('architecture','Architecture',['DDPM','DDIM','Score_SDE','NCSN'],'DDPM'), pn('timesteps','Diffusion timesteps',1000,10,10000), pn('epochs','Epochs',500,10,100000), ps('output_model','Diffusion model','diffusion_model'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_model} = diffusion_train(${p.data_var})`,
  },
  {
    id:'causal_inference', label:'Causal Inference', cat:'ml', color:'#65A30D', icon:'CI',
    info:'Estimate causal effects: DoWhy, propensity score, IV, DID.',
    params:[ps('data_var','Observational data','data'), ps('treatment_var','Treatment variable','T'), ps('outcome_var','Outcome variable','Y'), pj('confounders','Confounders','["age","sex","income"]'), psel('method','Method',['DoWhy','PSM','IPW','DID','RDD','IV'],'DoWhy'), ps('output_var','Causal effect','causal_effect'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('ate'), cOut('confidence_interval')],
    toSq: p=>`let ${p.output_var} = causal_effect(${p.data_var}, T="${p.treatment_var}", Y="${p.outcome_var}")`,
  },
  {
    id:'survival_analysis', label:'Survival Analysis', cat:'ml', color:'#65A30D', icon:'KM',
    info:'Time-to-event analysis: Kaplan-Meier, Cox PH, DeepHit.',
    params:[ps('data_var','Survival data','survival_data'), ps('time_col','Time column','time'), ps('event_col','Event column','event'), psel('model','Model',['Kaplan-Meier','Cox_PH','Weibull_AFT','DeepHit'],'Cox_PH'), ps('output_var','Survival result','surv_result'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('survival_curve'), cOut('hazard_ratios')],
    toSq: p=>`let ${p.output_var} = survival_analysis(${p.data_var}, model="${p.model}")`,
  },
  {
    id:'shap_explain', label:'SHAP Explainability', cat:'ml', color:'#65A30D', icon:'SHAP',
    info:'Model-agnostic SHAP feature importance: TreeSHAP, KernelSHAP, DeepSHAP.',
    params:[ps('model_var','Model','model'), ps('X_var','Data to explain','X'), psel('explainer','Explainer',['TreeExplainer','KernelExplainer','DeepExplainer','LinearExplainer'],'TreeExplainer'), pn('max_display','Max features displayed',20,1,1000), ps('output_var','SHAP values','shap_values'), ...BYPASS],
    inputs:[aIn('model'), aIn('X')], outputs:[cOut('shap_values'), cOut('importance_plot')],
    toSq: p=>`let ${p.output_var} = shap(${p.model_var}, ${p.X_var})`,
  },
  {
    id:'gp_regression', label:'Gaussian Process', cat:'ml', color:'#65A30D', icon:'GP',
    info:'Non-parametric Bayesian regression with uncertainty quantification.',
    params:[ps('X_train','Training X','X_train'), ps('y_train','Training y','y_train'), psel('kernel','Kernel',['RBF','Matern','RationalQuadratic','Periodic','DotProduct'],'RBF'), pn('noise_level','Noise level σ²',0.01,1e-6,100), ps('output_var','GP model','gp_model'), ...BYPASS],
    inputs:[aIn('X'), aIn('y')], outputs:[aOut('model'), cOut('log_marginal_likelihood')],
    toSq: p=>`let ${p.output_var} = gaussian_process(${p.X_train}, ${p.y_train}, kernel="${p.kernel}")`,
  },
  {
    id:'transfer_learn', label:'Transfer Learning', cat:'ml', color:'#65A30D', icon:'TL',
    info:'Fine-tune pretrained model on new task.',
    params:[ps('pretrained_model','Pretrained model','resnet50'), ps('X_train','Training data','X_train'), ps('y_train','Labels','y_train'), psel('strategy','Strategy',['full_finetune','head_only','LoRA','adapter'],'LoRA'), pn('epochs','Epochs',20,1,1000), pn('lr','Learning rate',1e-4,1e-7,0.1), ps('output_model','Fine-tuned model','ft_model'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_model} = transfer_learn("${p.pretrained_model}", ${p.X_train}, strategy="${p.strategy}")`,
  },
  {
    id:'pinn_block', label:'Physics-Informed NN', cat:'ml', color:'#65A30D', icon:'PINN',
    info:'Neural network constrained by physical PDEs (PINN).',
    params:[pc('pde_code','PDE definition','# du/dt = D * d²u/dx²'), psel('architecture','Architecture',['MLP','ResNet','Fourier_NN'],'MLP'), pn('hidden_layers','Hidden layers',4,1,20), pn('neurons','Neurons per layer',64,4,2048), pn('epochs','Epochs',10000,100,1000000), ps('output_model','PINN model','pinn_model'), ...BYPASS],
    inputs:[], outputs:[aOut('model'), cOut('pde_residual')],
    toSq: p=>`let ${p.output_model} = pinn_train(pde_fn, epochs=${p.epochs})`,
  },
  {
    id:'normalizing_flow', label:'Normalizing Flow', cat:'ml', color:'#65A30D', icon:'NF',
    info:'Exact density estimation: RealNVP, Glow, Neural Spline Flow.',
    params:[ps('data_var','Training data','data'), psel('architecture','Architecture',['RealNVP','Glow','MAF','Neural_Spline'],'RealNVP'), pn('n_flows','Flow layers',8,1,50), pn('epochs','Epochs',200,10,10000), ps('output_model','Flow model','flow_model'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('model'), cOut('log_likelihood')],
    toSq: p=>`let ${p.output_model} = normalizing_flow(${p.data_var}, arch="${p.architecture}")`,
  },
  {
    id:'active_learning_block', label:'Active Learning', cat:'ml', color:'#65A30D', icon:'AL',
    info:'Iterative labelling with uncertainty sampling, query-by-committee, or BADGE.',
    params:[ps('unlabelled_var','Unlabelled pool','X_pool'), ps('model_var','Initial model','model'), psel('strategy','Query strategy',['uncertainty','margin','entropy','BADGE','CoreSet'],'uncertainty'), pn('n_query','Queries per round',10,1,1000), ps('output_var','Labelled subset','queried_X'), ...BYPASS],
    inputs:[aIn('pool'), aIn('model')], outputs:[aOut('labelled_X'), cOut('query_indices')],
    toSq: p=>`let ${p.output_var} = active_learn(${p.unlabelled_var}, ${p.model_var}, strategy="${p.strategy}")`,
  },
  {
    id:'model_compression', label:'Model Compression', cat:'ml', color:'#65A30D', icon:'COMP',
    info:'Pruning, quantisation, and mixed-precision for efficient deployment.',
    params:[ps('model_var','Model to compress','model'), psel('method','Method',['magnitude_pruning','structured_pruning','INT8_quant','INT4_quant','mixed_precision'],'INT8_quant'), pn('target_sparsity','Target sparsity',0.5,0,0.99), ps('output_model','Compressed model','compressed_model'), ...BYPASS],
    inputs:[aIn('model')], outputs:[aOut('model'), cOut('compression_ratio')],
    toSq: p=>`let ${p.output_model} = compress(${p.model_var}, method="${p.method}")`,
  },

  // ── PHYSICS +14 ───────────────────────────────────────────────────────
  {
    id:'fluid_dynamics', label:'CFD Simulation', cat:'physics', color:'#4338CA', icon:'CFD',
    info:'Computational fluid dynamics: Navier-Stokes, LBM, SPH.',
    params:[ps('geometry_var','Geometry','domain'), psel('solver','Solver',['OpenFOAM','LBM','SPH','FEniCS'],'OpenFOAM'), pn('reynolds','Reynolds number',1000,1,1e9), pn('n_iter','Iterations',1000,10,100000), ps('output_var','Flow field','flow_field'), ...BYPASS],
    inputs:[aIn('geometry')], outputs:[cOut('velocity'), cOut('pressure')],
    toSq: p=>`let ${p.output_var} = cfd(${p.geometry_var}, Re=${p.reynolds})`,
  },
  {
    id:'finite_element', label:'Finite Element Analysis', cat:'physics', color:'#4338CA', icon:'FEA',
    info:'Structural mechanics, heat transfer, electromagnetics via FEM.',
    params:[ps('mesh_var','Mesh / geometry','mesh'), psel('physics','Physics',['structural','thermal','electromagnetic','multiphysics'],'structural'), psel('solver','Solver',['FEniCS','GetFEM','Elmer','Abaqus'],'FEniCS'), ps('boundary_conditions_var','Boundary conditions','bcs'), ps('output_var','FEM result','fem_result'), ...BYPASS],
    inputs:[aIn('mesh')], outputs:[cOut('displacement'), cOut('stress')],
    toSq: p=>`let ${p.output_var} = fem(${p.mesh_var}, physics="${p.physics}")`,
  },
  {
    id:'em_field_sim', label:'EM Field Simulation', cat:'physics', color:'#4338CA', icon:'EM',
    info:'Maxwell equations: FDTD, FEM, MoM for antenna, waveguide, photonics.',
    params:[ps('geometry_var','Structure','geometry'), psel('method','Method',['FDTD','FEM','MoM','RCWA'],'FDTD'), pn('frequency_ghz','Frequency (GHz)',10,0.001,1e6), ps('excitation_var','Excitation','source'), ps('output_var','EM fields','em_result'), ...BYPASS],
    inputs:[aIn('geometry')], outputs:[cOut('E_field'), cOut('H_field'), cOut('S_params')],
    toSq: p=>`let ${p.output_var} = em_sim(${p.geometry_var}, f=${p.frequency_ghz})`,
  },
  {
    id:'plasma_sim', label:'Plasma Simulation', cat:'physics', color:'#4338CA', icon:'PLS',
    info:'Particle-in-cell or fluid plasma simulation for fusion and astrophysics.',
    params:[ps('init_conditions','Initial conditions','plasma_init'), psel('model','Model',['PIC','MHD','Vlasov','hybrid'],'PIC'), pn('n_particles','Particles',10000,100,1e9), pn('n_steps','Steps',1000,10,1e7), ps('output_var','Plasma state','plasma_result'), ...BYPASS],
    inputs:[], outputs:[cOut('density'), cOut('temperature')],
    toSq: p=>`let ${p.output_var} = plasma_sim(model="${p.model}", n=${p.n_particles})`,
  },
  {
    id:'nuclear_physics', label:'Nuclear Reactions', cat:'physics', color:'#4338CA', icon:'☢',
    info:'Nuclear cross-section, decay chains, fission/fusion Q-values.',
    params:[ps('reaction','Reaction (e.g. n+U235→...)','n+U235'), psel('calculation','Calculation',['cross_section','Q_value','decay_chain','neutronics'],'Q_value'), ps('output_var','Result','nuclear_result'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = nuclear("${p.reaction}", calc="${p.calculation}")`,
  },
  {
    id:'optics_sim', label:'Optics & Photonics', cat:'physics', color:'#4338CA', icon:'🔭',
    info:'Ray tracing, wavefront analysis, photonic crystal bands.',
    params:[ps('optical_system_var','Optical system','optics'), psel('simulation','Simulation',['ray_tracing','wave_optics','photonic_bands','FDTD_photonic'],'ray_tracing'), ps('source_var','Light source','laser'), ps('output_var','Optical result','optical_result'), ...BYPASS],
    inputs:[aIn('system')], outputs:[cOut('intensity'), cOut('wavefront')],
    toSq: p=>`let ${p.output_var} = optics_sim(${p.optical_system_var})`,
  },
  {
    id:'quantum_optics', label:'Quantum Optics', cat:'physics', color:'#4338CA', icon:'Q-OPT',
    info:'Jaynes-Cummings, cavity QED, master equation for open quantum systems.',
    params:[ps('system_var','System Hamiltonian','H_sys'), ps('collapse_var','Collapse operators','c_ops'), pn('t_max','Max time',100,0.1,10000), pn('n_timesteps','Time steps',1000,10,100000), ps('output_var','Quantum state evolution','q_opt_result'), ...BYPASS],
    inputs:[], outputs:[cOut('states'), cOut('expectation_values')],
    toSq: p=>`let ${p.output_var} = mesolve(${p.system_var}, t_max=${p.t_max})`,
  },
  {
    id:'tensor_network', label:'Tensor Network', cat:'physics', color:'#4338CA', icon:'TN',
    info:'MPS, DMRG, TEBD, PEPS for quantum many-body systems.',
    params:[psel('ansatz','Tensor network',['MPS','DMRG','TEBD','PEPS','MERA'],'MPS'), pn('bond_dim','Bond dimension χ',64,2,4096), psel('task','Task',['ground_state','time_evolution','finite_T','excitations'],'ground_state'), ps('hamiltonian_var','Hamiltonian','H'), ps('output_var','TN result','tn_result'), ...BYPASS],
    inputs:[aIn('H')], outputs:[cOut('energy'), cOut('state')],
    toSq: p=>`let ${p.output_var} = dmrg(${p.hamiltonian_var}, chi=${p.bond_dim})`,
  },
  {
    id:'spin_boson', label:'Spin-Boson Model', cat:'physics', color:'#4338CA', icon:'SB',
    info:'Open quantum system: two-level system coupled to bosonic bath.',
    params:[pn('epsilon','Bias e',0,-10,10), pn('delta','Tunnelling D',1,0,100), pn('alpha','Kondo coupling a',0.1,0,1), pn('omega_c','Cutoff freq wc',10,0.1,1000), psel('method','Method',['HEOM','QUAPI','mPS','Bloch-Redfield'],'HEOM'), ps('output_var','Dynamics','sb_result'), ...BYPASS],
    inputs:[], outputs:[cOut('population'), cOut('coherence')],
    toSq: p=>`let ${p.output_var} = spin_boson(eps=${p.epsilon}, delta=${p.delta})`,
  },
  {
    id:'qed_calc', label:'QED Calculation', cat:'physics', color:'#4338CA', icon:'QED',
    info:'Quantum Electrodynamics: Feynman diagram evaluation, S-matrix elements.',
    params:[ps('process','QED process','e+e- → γγ'), pn('com_energy_gev','CoM energy (GeV)',91.2,0.001,14000), pn('n_loops','Loop order',0,0,3), ps('output_var','Cross section','qed_result'), ...BYPASS],
    inputs:[], outputs:[cOut('cross_section'), cOut('amplitude')],
    toSq: p=>`let ${p.output_var} = qed("${p.process}", sqrt_s=${p.com_energy_gev})`,
  },
  {
    id:'topological_phase', label:'Topological Phase', cat:'physics', color:'#4338CA', icon:'TOP',
    info:'Compute topological invariants: Chern number, Z2 index, winding number.',
    params:[ps('hamiltonian_var','Hamiltonian','H_k'), psel('invariant','Topological invariant',['Chern_number','Z2_index','winding_number','Berry_phase'],'Chern_number'), pn('n_k_points','k-grid per dim',100,10,10000), ps('output_var','Topological invariant','topo_result'), ...BYPASS],
    inputs:[aIn('H')], outputs:[cOut('invariant')],
    toSq: p=>`let ${p.output_var} = topological_invariant(${p.hamiltonian_var})`,
  },
  {
    id:'quantum_transport', label:'Quantum Transport', cat:'physics', color:'#4338CA', icon:'NEGF',
    info:'Non-equilibrium Green function (NEGF) for quantum device transport.',
    params:[ps('device_hamiltonian','Device Hamiltonian','H_dev'), ps('lead_L_var','Left lead','H_L'), ps('lead_R_var','Right lead','H_R'), pn('voltage_V','Bias voltage (V)',0.1,-10,10), ps('output_var','Transmission','transport_result'), ...BYPASS],
    inputs:[], outputs:[cOut('transmission'), cOut('current')],
    toSq: p=>`let ${p.output_var} = negf_transport(H_dev, V=${p.voltage_V})`,
  },
  {
    id:'semiclassical_approx', label:'Semiclassical Approx', cat:'physics', color:'#4338CA', icon:'WKB',
    info:'WKB approximation, stationary phase, periodic orbit theory.',
    params:[ps('potential_fn','Potential V(x)','V'), pn('hbar','ℏ',1.0,1e-10,1000), psel('method','Method',['WKB','stationary_phase','periodic_orbit'],'WKB'), ps('output_var','Semiclassical result','wkb_result'), ...BYPASS],
    inputs:[], outputs:[cOut('amplitude'), cOut('phase')],
    toSq: p=>`let ${p.output_var} = wkb(${p.potential_fn})`,
  },
  {
    id:'dft_plus_u', label:'DFT+U', cat:'physics', color:'#4338CA', icon:'DFT+U',
    info:'DFT with Hubbard U correction for strongly correlated materials (Mott insulators, TM oxides).',
    params:[ps('crystal_var','Crystal','crystal'), pn('U_value_eV','U value (eV)',4.0,0,20), ps('target_species','Target species','Fe'), psel('code','Code',['VASP','QuantumESPRESSO','WIEN2k'],'QuantumESPRESSO'), ps('output_var','DFT+U result','dftu_result'), ...BYPASS],
    inputs:[aIn('crystal')], outputs:[cOut('band_gap'), cOut('dos')],
    toSq: p=>`let ${p.output_var} = dft_plus_u(${p.crystal_var}, U=${p.U_value_eV})`,
  },

  // ── GENAI +14 ─────────────────────────────────────────────────────────
  {
    id:'prompt_template', label:'Prompt Template', cat:'genai', color:'#9333EA', icon:'PT',
    info:'Jinja2-style prompt template with variable substitution.',
    params:[pc('template','Template','You are a {{role}}. Answer: {{question}}'), pj('variables','Variables','{"role":"scientist","question":"..."}'), ps('output_var','Rendered prompt','prompt'), ...BYPASS],
    inputs:[cIn('vars')], outputs:[cOut('prompt')],
    toSq: p=>`let ${p.output_var} = prompt_template("""${p.template}""")`,
  },
  {
    id:'chain_of_thought', label:'Chain of Thought', cat:'genai', color:'#9333EA', icon:'CoT',
    info:'Few-shot chain-of-thought prompting for complex reasoning.',
    params:[ps('question_var','Question','question'), pj('examples','CoT examples','[{"q":"...","cot":"...","a":"..."}]'), psel('model','LLM model',['claude-sonnet-4-6','gpt-4o','gemini-2.5-flash'],'claude-sonnet-4-6'), ps('output_var','Answer','cot_answer'), ...BYPASS],
    inputs:[cIn('question')], outputs:[cOut('answer'), cOut('reasoning')],
    toSq: p=>`let ${p.output_var} = chain_of_thought(${p.question_var}, model="${p.model}")`,
  },
  {
    id:'tool_use_block', label:'LLM Tool Use', cat:'genai', color:'#9333EA', icon:'🔧LLM',
    info:'Structured function calling / tool use for Anthropic, OpenAI, Gemini.',
    params:[ps('prompt_var','User prompt','task'), pj('tools','Tool definitions','[{"name":"calculator","description":"...","parameters":{}}]'), psel('model','Model',['claude-sonnet-4-6','gpt-4o','gemini-2.5-pro'],'claude-sonnet-4-6'), ps('output_var','Tool result','tool_result'), ...BYPASS],
    inputs:[cIn('prompt')], outputs:[cOut('result'), cOut('tool_calls')],
    toSq: p=>`let ${p.output_var} = llm_tool_use(${p.prompt_var}, model="${p.model}")`,
  },
  {
    id:'structured_output', label:'Structured Output', cat:'genai', color:'#9333EA', icon:'{}LLM',
    info:'Force LLM to return valid JSON matching a schema (JSON mode / Instructor).',
    params:[ps('prompt_var','Prompt','prompt'), pj('schema','Output schema','{"type":"object","properties":{"name":{"type":"string"}}}'), psel('model','Model',['claude-sonnet-4-6','gpt-4o','gemini-2.5-flash'],'gpt-4o'), ps('output_var','Parsed object','structured_data'), ...BYPASS],
    inputs:[cIn('prompt')], outputs:[cOut('data')],
    toSq: p=>`let ${p.output_var} = structured_output(${p.prompt_var}, schema=${p.schema})`,
  },
  {
    id:'vector_store_block', label:'Vector Store', cat:'genai', color:'#9333EA', icon:'VS',
    info:'Build and query semantic vector store for documents.',
    params:[ps('documents_var','Documents','docs'), psel('store','Vector store',['ChromaDB','Pinecone','Qdrant','FAISS','pgvector'],'ChromaDB'), psel('embedding_model','Embedding model',['text-embedding-3-small','all-MiniLM-L6','mxbai-embed-large'],'text-embedding-3-small'), ps('collection','Collection name','my_docs'), ps('output_var','Vector store','vstore'), ...BYPASS],
    inputs:[aIn('docs')], outputs:[aOut('vector_store')],
    toSq: p=>`let ${p.output_var} = vector_store(${p.documents_var}, store="${p.store}")`,
  },
  {
    id:'semantic_search', label:'Semantic Search', cat:'genai', color:'#9333EA', icon:'🔍LLM',
    info:'Dense vector similarity search over embedded documents.',
    params:[ps('query_var','Query','query'), ps('vstore_var','Vector store','vstore'), pn('top_k','Top-K results',5,1,100), pn('min_score','Min similarity',0.7,0,1), ps('output_var','Search results','search_results'), ...BYPASS],
    inputs:[cIn('query'), aIn('store')], outputs:[cOut('results')],
    toSq: p=>`let ${p.output_var} = semantic_search(${p.query_var}, ${p.vstore_var}, k=${p.top_k})`,
  },
  {
    id:'llm_judge', label:'LLM Judge', cat:'genai', color:'#9333EA', icon:'⚖LLM',
    info:'Use LLM to evaluate quality, accuracy, or toxicity of generated text.',
    params:[ps('response_var','Response to evaluate','response'), ps('criteria_var','Evaluation criteria','criteria'), psel('judge_model','Judge model',['gpt-4o','claude-opus-4-6','gemini-2.5-pro'],'gpt-4o'), psel('output_format','Output format',['score_1_10','pass_fail','rubric'],'score_1_10'), ps('output_var','Score','llm_score'), ...BYPASS],
    inputs:[cIn('response')], outputs:[cOut('score'), cOut('reasoning')],
    toSq: p=>`let ${p.output_var} = llm_judge(${p.response_var}, model="${p.judge_model}")`,
  },
  {
    id:'memory_block', label:'Conversation Memory', cat:'genai', color:'#9333EA', icon:'🧠LLM',
    info:'Persist and retrieve conversation history for multi-turn LLM interactions.',
    params:[psel('memory_type','Memory type',['buffer','summary','entity','vector'],'buffer'), pn('max_tokens','Max memory tokens',4000,100,200000), ps('session_id','Session ID','session_001'), ps('output_var','Memory store','memory'), ...BYPASS],
    inputs:[aIn('conversation')], outputs:[aOut('memory')],
    toSq: p=>`let ${p.output_var} = memory_store("${p.session_id}", type="${p.memory_type}")`,
  },
  {
    id:'guardrails_block', label:'LLM Guardrails', cat:'genai', color:'#9333EA', icon:'🛡LLM',
    info:'Input/output validation: content moderation, PII detection, topic filtering.',
    params:[ps('text_var','Text to check','text'), pj('checks','Guardrail checks','["pii","toxicity","off_topic"]'), psel('action_on_fail','Action',['block','warn','redact','log'],'warn'), ps('output_var','Safe text','safe_text'), ...BYPASS],
    inputs:[cIn('text')], outputs:[cOut('text'), cOut('flags')],
    toSq: p=>`let ${p.output_var} = guardrails(${p.text_var})`,
  },
  {
    id:'fine_tune_block', label:'LLM Fine-Tuning', cat:'genai', color:'#9333EA', icon:'FT-LLM',
    info:'Fine-tune LLMs: LoRA, QLoRA, full fine-tuning via OpenAI or HuggingFace.',
    params:[ps('base_model','Base model','meta-llama/Llama-3.1-8B'), ps('training_data_var','Training JSONL','train_data'), psel('method','Method',['LoRA','QLoRA','full_finetune','DPO','RLHF'],'LoRA'), pn('epochs','Epochs',3,1,100), pn('lr','Learning rate',2e-4,1e-6,0.1), ps('output_model','Output model','ft_llm'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('model')],
    toSq: p=>`let ${p.output_model} = finetune("${p.base_model}", ${p.training_data_var}, method="${p.method}")`,
  },
  {
    id:'multimodal_block', label:'Multimodal LLM', cat:'genai', color:'#9333EA', icon:'MM-LLM',
    info:'Vision+language: analyse images, PDFs, audio with GPT-4o, Claude, Gemini.',
    params:[ps('text_var','Text prompt','prompt'), psel('media_type','Media type',['image','pdf','audio','video'],'image'), ps('media_var','Media variable','img'), psel('model','Model',['gpt-4o','claude-sonnet-4-6','gemini-2.5-flash'],'gpt-4o'), ps('output_var','Response','mm_response'), ...BYPASS],
    inputs:[cIn('prompt'), aIn('media')], outputs:[cOut('response')],
    toSq: p=>`let ${p.output_var} = multimodal(${p.text_var}, ${p.media_var}, model="${p.model}")`,
  },
  {
    id:'code_gen_block', label:'Code Generation', cat:'genai', color:'#9333EA', icon:'</> LLM',
    info:'AI code generation, explanation, refactoring, and review.',
    params:[ps('instruction_var','Coding instruction','instruction'), psel('language','Language',['Python','JavaScript','TypeScript','Rust','Go','C++','Java','SQL'],'Python'), psel('model','Model',['claude-sonnet-4-6','gpt-4o','gemini-2.5-flash','deepseek-r1'],'claude-sonnet-4-6'), ps('output_var','Generated code','gen_code'), ...BYPASS],
    inputs:[cIn('instruction')], outputs:[cOut('code')],
    toSq: p=>`let ${p.output_var} = code_gen("${p.instruction_var}", lang="${p.language}")`,
  },
  {
    id:'eval_framework', label:'LLM Eval Framework', cat:'genai', color:'#9333EA', icon:'EVAL',
    info:'Evaluate LLM responses: RAGAS, DeepEval, custom metrics.',
    params:[ps('dataset_var','Eval dataset','eval_data'), pj('metrics','Metrics','["faithfulness","answer_relevancy","context_precision"]'), psel('framework','Framework',['RAGAS','DeepEval','HELM','EleutherAI_Eval'],'RAGAS'), ps('output_var','Eval scores','eval_scores'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('scores'), cOut('report')],
    toSq: p=>`let ${p.output_var} = llm_eval(${p.dataset_var}, framework="${p.framework}")`,
  },
  {
    id:'synthetic_data_gen', label:'Synthetic Data Gen', cat:'genai', color:'#9333EA', icon:'SYN-D',
    info:'Generate synthetic training data using LLMs.',
    params:[ps('schema_var','Data schema','schema'), psel('method','Method',['few_shot_llm','evol_instruct','self_instruct','backtranslation'],'self_instruct'), pn('n_samples','Samples',1000,10,1000000), psel('model','Model',['gpt-4o','claude-sonnet-4-6'],'gpt-4o'), ps('output_var','Synthetic data','synthetic_data'), ...BYPASS],
    inputs:[aIn('schema')], outputs:[aOut('data')],
    toSq: p=>`let ${p.output_var} = synth_data(${p.schema_var}, n=${p.n_samples})`,
  },

  // ── MATH +10 ──────────────────────────────────────────────────────────
  {
    id:'symbolic_math', label:'Symbolic Math (SymPy)', cat:'math', color:'#6366F1', icon:'∂',
    info:'Computer algebra: simplify, differentiate, integrate, solve, series expand.',
    params:[pc('expression','Expression','x**2 + 2*x + 1'), psel('operation','Operation',['simplify','diff','integrate','solve','series','factor','expand','laplace'],'simplify'), ps('variable','Variable','x'), ps('output_var','Result','sym_result'), ...BYPASS],
    inputs:[cIn('expr')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = sympy_${p.operation}("${p.expression}", var="${p.variable}")`,
  },
  {
    id:'ode_solver', label:'ODE Solver', cat:'math', color:'#6366F1', icon:'dy/dx',
    info:'Solve ODEs: scipy solve_ivp — RK45, DOP853, LSODA, Radau.',
    params:[pc('rhs_code','RHS function dy/dt = f(t,y)','lambda t,y: [-y[0]]'), pj('y0','Initial conditions','[1.0]'), pn('t_start','t start',0), pn('t_end','t end',10), psel('method','Method',['RK45','DOP853','LSODA','Radau','BDF'],'RK45'), ps('output_var','Solution','ode_result'), ...BYPASS],
    inputs:[], outputs:[cOut('t'), cOut('y')],
    toSq: p=>`let ${p.output_var} = ode_solve(rhs, y0=${p.y0}, t=[${p.t_start},${p.t_end}])`,
  },
  {
    id:'pde_solver', label:'PDE Solver', cat:'math', color:'#6366F1', icon:'∂²',
    info:'Finite difference/element PDE solver: heat, wave, Schrödinger, Burgers.',
    params:[psel('equation','PDE',['heat','wave','schrodinger','burgers','poisson'],'heat'), pn('nx','Grid x',100,10,10000), pn('ny','Grid y',100,10,10000), pn('dt','dt',0.001,1e-10,1), pn('n_steps','Steps',1000,1,1e7), ps('output_var','Solution','pde_result'), ...BYPASS],
    inputs:[], outputs:[cOut('solution')],
    toSq: p=>`let ${p.output_var} = pde_solve("${p.equation}", nx=${p.nx})`,
  },
  {
    id:'root_finding', label:'Root Finding', cat:'math', color:'#6366F1', icon:'f(x)=0',
    info:'Bisection, Newton-Raphson, Brent, secant method for f(x)=0.',
    params:[pc('fn_code','Function f(x)','lambda x: x**3 - x - 2'), pn('x0','Initial guess',1.0), psel('method','Method',['brentq','newton','bisect','secant'],'brentq'), pn('tol','Tolerance',1e-10,1e-15,0.01), ps('output_var','Root','root'), ...BYPASS],
    inputs:[], outputs:[cOut('root'), cOut('iterations')],
    toSq: p=>`let ${p.output_var} = root_find(f, x0=${p.x0}, method="${p.method}")`,
  },
  {
    id:'interpolation_block', label:'Interpolation', cat:'math', color:'#6366F1', icon:'~f',
    info:'1D/2D interpolation: linear, cubic spline, RBF, kriging.',
    params:[ps('x_var','X data','x'), ps('y_var','Y data','y'), psel('method','Method',['linear','cubic_spline','akima','PCHIP','RBF','kriging'],'cubic_spline'), ps('x_new_var','New X points','x_new'), ps('output_var','Interpolated values','y_interp'), ...BYPASS],
    inputs:[cIn('x'), cIn('y')], outputs:[cOut('y_new')],
    toSq: p=>`let ${p.output_var} = interpolate(${p.x_var}, ${p.y_var}, ${p.x_new_var})`,
  },
  {
    id:'numerical_integration', label:'Numerical Integration', cat:'math', color:'#6366F1', icon:'∫',
    info:'Quadrature: Gaussian, Simpson, adaptive, Monte Carlo integration.',
    params:[pc('fn_code','Integrand f(x)','lambda x: np.sin(x)**2'), pn('a','Lower bound',0), pn('b','Upper bound',Math.PI), psel('method','Method',['quad','dblquad','Gaussian','Monte_Carlo','Simpson'],'quad'), pn('n_points','Points (MC)',10000,100,1e9), ps('output_var','Integral','integral'), ...BYPASS],
    inputs:[], outputs:[cOut('result'), cOut('error')],
    toSq: p=>`let ${p.output_var} = integrate(f, ${p.a}, ${p.b})`,
  },
  {
    id:'eigenvalue_block', label:'Eigenvalue Solver', cat:'math', color:'#6366F1', icon:'λ=Av',
    info:'Dense or sparse eigenvalue/eigenvector decomposition.',
    params:[ps('matrix_var','Matrix','A'), psel('solver','Solver',['numpy_eig','scipy_eigh','ARPACK_sparse','LAPACK'],'numpy_eig'), pn('k_evals','k eigenvalues (sparse)',6,1,1000), pb('hermitian','Hermitian/symmetric',true), ps('output_var','Eigenvalues','eigenvalues'), ...BYPASS],
    inputs:[cIn('A')], outputs:[cOut('eigenvalues'), cOut('eigenvectors')],
    toSq: p=>`let ${p.output_var} = eig(${p.matrix_var})`,
  },
  {
    id:'random_numbers', label:'Random Number Generator', cat:'math', color:'#6366F1', icon:'RNG',
    info:'Pseudo-random and quasi-random sequences: uniform, normal, Sobol, Halton.',
    params:[psel('distribution','Distribution',['uniform','normal','exponential','poisson','beta','gamma','Sobol','Halton'],'normal'), pn('n_samples','Samples',1000,1,1e9), pj('params','Distribution params','{"loc":0,"scale":1}'), pn('seed','Random seed',42,0,2**32), ps('output_var','Samples','random_samples'), ...BYPASS],
    inputs:[], outputs:[cOut('samples')],
    toSq: p=>`let ${p.output_var} = random("${p.distribution}", n=${p.n_samples}, seed=${p.seed})`,
  },
  {
    id:'graph_theory', label:'Graph Theory', cat:'math', color:'#6366F1', icon:'G=(V,E)',
    info:'NetworkX graph algorithms: shortest path, MST, centrality, flow, colouring.',
    params:[ps('graph_var','Graph variable','G'), psel('algorithm','Algorithm',['shortest_path','MST','max_flow','min_cut','pagerank','betweenness_centrality','coloring','matching'],'shortest_path'), ps('source_var','Source node','s'), ps('target_var','Target node','t'), ps('output_var','Result','graph_result'), ...BYPASS],
    inputs:[aIn('G')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = graph_${p.algorithm}(${p.graph_var})`,
  },
  {
    id:'information_theory', label:'Information Theory', cat:'math', color:'#6366F1', icon:'H(X)',
    info:'Shannon entropy, mutual information, KL divergence, Fisher information.',
    params:[ps('p_var','Distribution p','p'), ps('q_var','Distribution q (optional)','q'), psel('metric','Metric',['entropy','mutual_info','kl_divergence','js_divergence','fisher_info','channel_capacity'],'entropy'), ps('output_var','Result','info_result'), ...BYPASS],
    inputs:[cIn('p'), cIn('q')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = ${p.metric}(${p.p_var})`,
  },

  // ── OUTPUT +10 ────────────────────────────────────────────────────────
  {
    id:'interactive_dash', label:'Interactive Dashboard', cat:'output', color:'#F59E0B', icon:'📊dash',
    info:'Build interactive Dash/Streamlit/Panel dashboard from data.',
    params:[ps('data_var','Data variable','data'), psel('framework','Framework',['Plotly_Dash','Streamlit','Panel','Bokeh_serve'],'Plotly_Dash'), ps('title','Dashboard title','Sanskrit Dashboard'), ps('output_port','Port',8050), ...BYPASS],
    inputs:[aIn('data')], outputs:[],
    toSq: p=>`dashboard(${p.data_var}, title="${p.title}")`,
  },
  {
    id:'bloch_sphere', label:'Bloch Sphere', cat:'output', color:'#F59E0B', icon:'⊙',
    info:'Render single-qubit state on Bloch sphere.',
    params:[ps('register','Register','q'), pq('qubit_idx','Qubit index',0), pb('animate','Animate gate sequence',false), ...BYPASS],
    inputs:[rIn()], outputs:[],
    toSq: p=>`bloch_sphere(q[${p.qubit_idx}])`,
  },
  {
    id:'histogram_plot', label:'Histogram Plot', cat:'output', color:'#F59E0B', icon:'▐▌',
    info:'Plot measurement histogram with configurable bins and normalisation.',
    params:[ps('data_var','Data variable','result.histogram'), pn('bins','Bins (0=auto)',0,0,1000), pb('normalise','Normalise to probabilities',false), ps('title','Title','Measurement Histogram'), ...BYPASS],
    inputs:[cIn('data')], outputs:[],
    toSq: p=>`plot_histogram(${p.data_var})`,
  },
  {
    id:'network_graph_plot', label:'Network Graph', cat:'output', color:'#F59E0B', icon:'⬡',
    info:'Visualise graph structure with Pyvis, Gephi-export, or D3.',
    params:[ps('graph_var','Graph variable','G'), psel('layout','Layout',['spring','circular','kamada_kawai','spectral','shell'],'spring'), pb('interactive','Interactive HTML',true), ps('output_file','Output file','graph.html'), ...BYPASS],
    inputs:[aIn('G')], outputs:[cOut('html_file')],
    toSq: p=>`plot_network(${p.graph_var})`,
  },
  {
    id:'heatmap_plot', label:'Heatmap', cat:'output', color:'#F59E0B', icon:'🔥',
    info:'Heatmap / correlation matrix / confusion matrix visualisation.',
    params:[ps('matrix_var','Matrix variable','matrix'), ps('title','Title','Heatmap'), psel('colormap','Colormap',['viridis','plasma','RdBu_r','coolwarm','YlOrRd'],'viridis'), pb('annotate','Annotate cells',true), pb('cluster','Hierarchical cluster',false), ...BYPASS],
    inputs:[cIn('matrix')], outputs:[],
    toSq: p=>`heatmap(${p.matrix_var}, title="${p.title}")`,
  },
  {
    id:'report_gen', label:'Report Generator', cat:'output', color:'#F59E0B', icon:'📑',
    info:'Auto-generate PDF/HTML report from experiment results.',
    params:[ps('title','Report title','Sanskrit Experiment Report'), ps('data_var','Results variable','results'), psel('format','Format',['PDF','HTML','Markdown','DOCX'],'HTML'), ps('output_file','Output file','report.html'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('file_path')],
    toSq: p=>`generate_report("${p.title}", ${p.data_var}, format="${p.format}")`,
  },
  {
    id:'animation_block', label:'Animation', cat:'output', color:'#F59E0B', icon:'🎬📊',
    info:'Animate state evolution, VQE convergence, or molecular dynamics.',
    params:[ps('frames_var','Frames data','frames'), psel('type','Animation type',['state_evolution','vqe_convergence','md_trajectory','custom'],'state_evolution'), pn('fps','FPS',30,1,120), ps('output_file','Output file','animation.gif'), ...BYPASS],
    inputs:[aIn('frames')], outputs:[cOut('gif_path')],
    toSq: p=>`animate(${p.frames_var}, fps=${p.fps})`,
  },
  {
    id:'mol_visualise', label:'Molecule Visualiser', cat:'output', color:'#F59E0B', icon:'⬡3D',
    info:'3D molecular visualisation with py3Dmol / NGLview / RDKit 2D depiction.',
    params:[ps('mol_var','Molecule / trajectory','mol'), psel('engine','Engine',['py3Dmol','NGLview','rdkit_2d','JSME'],'py3Dmol'), psel('style','Style',['stick','ball_and_stick','surface','ribbon'],'ball_and_stick'), ...BYPASS],
    inputs:[aIn('mol')], outputs:[],
    toSq: p=>`visualise_mol(${p.mol_var})`,
  },
  {
    id:'console_log_block', label:'Console Log', cat:'output', color:'#F59E0B', icon:'>>',
    info:'Pretty-print complex objects (dict, list, quantum state) to logs panel.',
    params:[ps('value_var','Value','result'), psel('format','Format',['pprint','json','yaml','repr'],'pprint'), ps('prefix','Log prefix','[result]'), ...BYPASS],
    inputs:[aIn('value')], outputs:[],
    toSq: p=>`print("${p.prefix}", ${p.value_var})`,
  },
  {
    id:'latex_output', label:'LaTeX Output', cat:'output', color:'#F59E0B', icon:'LaTeX',
    info:'Render mathematical expressions as LaTeX in output panel.',
    params:[ps('expr_var','Expression or LaTeX string','result'), pb('auto_convert','Auto-convert from SymPy',true), ps('label','Equation label','Eq. 1'), ...BYPASS],
    inputs:[cIn('expr')], outputs:[],
    toSq: p=>`latex_render(${p.expr_var})`,
  },

  // ── API +10 ───────────────────────────────────────────────────────────
  {
    id:'grpc_block', label:'gRPC Client', cat:'api', color:'#0284C7', icon:'gRPC',
    info:'Call gRPC services with protobuf message serialisation.',
    params:[ps('endpoint','gRPC endpoint','localhost:50051'), ps('service','Service name','MyService'), ps('method','RPC method','GetData'), ps('request_var','Request message','request'), ps('output_var','Response','grpc_response'), ...BYPASS],
    inputs:[aIn('request')], outputs:[cOut('response')],
    toSq: p=>`let ${p.output_var} = grpc_call("${p.endpoint}", "${p.service}.${p.method}", ${p.request_var})`,
  },
  {
    id:'mqtt_block', label:'MQTT', cat:'api', color:'#0284C7', icon:'MQTT',
    info:'IoT messaging: publish/subscribe to MQTT broker.',
    params:[ps('broker','MQTT broker','mqtt://localhost:1883'), ps('topic','Topic','sanskrit/results'), psel('operation','Operation',['publish','subscribe','listen'],'publish'), ps('payload_var','Payload','message'), ps('output_var','Received message','mqtt_msg'), ...BYPASS],
    inputs:[aIn('payload')], outputs:[cOut('message')],
    toSq: p=>`let ${p.output_var} = mqtt_${p.operation}("${p.broker}", "${p.topic}")`,
  },
  {
    id:'websocket_client', label:'WebSocket Client', cat:'api', color:'#0284C7', icon:'WS',
    info:'WebSocket client for real-time bidirectional communication.',
    params:[ps('url','WebSocket URL','ws://localhost:8080'), ps('message_var','Message to send','msg'), pn('timeout_ms','Timeout (ms)',30000,100,300000), ps('output_var','Response','ws_response'), ...BYPASS],
    inputs:[cIn('message')], outputs:[cOut('response')],
    toSq: p=>`let ${p.output_var} = ws_send("${p.url}", ${p.message_var})`,
  },
  {
    id:'s3_stream', label:'S3 Streaming Upload', cat:'api', color:'#0284C7', icon:'S3↑',
    info:'Stream-upload large files to S3 using multipart upload.',
    params:[ps('data_var','Data variable','large_data'), ps('bucket','S3 bucket','my-bucket'), ps('key','Object key','output/result.parquet'), pn('part_size_mb','Part size (MB)',10,5,5000), ps('output_var','Upload result','s3_result'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('s3_uri')],
    toSq: p=>`let ${p.output_var} = s3_stream_upload("${p.bucket}", "${p.key}", ${p.data_var})`,
  },
  {
    id:'sftp_block', label:'SFTP', cat:'api', color:'#0284C7', icon:'SFTP',
    info:'Secure file transfer via SFTP.',
    params:[ps('host','Hostname','sftp.example.com'), pn('port','Port',22,1,65535), ps('username_var','Username env var','SFTP_USER'), ps('key_file_var','Key file env var','SFTP_KEY'), psel('operation','Operation',['upload','download','list','delete'],'upload'), ps('remote_path','Remote path','/data/'), ps('local_path','Local path','./output.csv'), ...BYPASS],
    inputs:[], outputs:[cOut('result')],
    toSq: p=>`sftp_${p.operation}("${p.host}", "${p.remote_path}", "${p.local_path}")`,
  },
  {
    id:'prometheus_push', label:'Prometheus Push', cat:'api', color:'#0284C7', icon:'PROM',
    info:'Push metrics to Prometheus Pushgateway.',
    params:[ps('pushgateway_url','Pushgateway URL','http://localhost:9091'), ps('job_name','Job name','sanskrit_experiment'), ps('metric_name','Metric name','vqe_energy'), ps('value_var','Value','energy'), ps('labels_var','Labels dict','labels'), ...BYPASS],
    inputs:[cIn('value')], outputs:[],
    toSq: p=>`prometheus_push("${p.metric_name}", ${p.value_var})`,
  },
  {
    id:'slack_message', label:'Slack Notification', cat:'api', color:'#0284C7', icon:'Slack',
    info:'Send formatted Slack message with blocks and attachments.',
    params:[ps('channel','Channel','#experiments'), ps('message_var','Message text','msg'), pb('use_blocks','Use Block Kit',false), ps('webhook_var','Webhook env var','SLACK_WEBHOOK'), ...BYPASS],
    inputs:[cIn('message')], outputs:[cOut('ts','Message timestamp')],
    toSq: p=>`slack_send("${p.channel}", ${p.message_var})`,
  },
  {
    id:'arxiv_fetch', label:'arXiv Fetch', cat:'api', color:'#0284C7', icon:'arXiv',
    info:'Fetch paper metadata and abstracts from arXiv API.',
    params:[ps('query','Search query','quantum error correction 2025'), pn('max_results','Max results',10,1,200), psel('sort_by','Sort by',['relevance','lastUpdatedDate','submittedDate'],'relevance'), ps('output_var','Papers','arxiv_papers'), ...BYPASS],
    inputs:[], outputs:[cOut('papers')],
    toSq: p=>`let ${p.output_var} = arxiv_search("${p.query}", n=${p.max_results})`,
  },
  {
    id:'pubmed_fetch', label:'PubMed Fetch', cat:'api', color:'#0284C7', icon:'PubMed',
    info:'Fetch biomedical literature from NCBI PubMed.',
    params:[ps('query','Search query','CRISPR cancer therapy'), pn('max_results','Max results',10,1,1000), ps('email','NCBI email (required)','user@example.com'), ps('output_var','Articles','pubmed_results'), ...BYPASS],
    inputs:[], outputs:[cOut('articles')],
    toSq: p=>`let ${p.output_var} = pubmed_search("${p.query}", n=${p.max_results})`,
  },
  {
    id:'discord_block', label:'Discord Webhook', cat:'api', color:'#0284C7', icon:'Discord',
    info:'Send notifications to Discord channel via webhook.',
    params:[ps('webhook_var','Webhook env var','DISCORD_WEBHOOK'), ps('content_var','Message content','msg'), ps('username','Bot username','Sanskrit Bot'), pb('tts','Text to speech',false), ...BYPASS],
    inputs:[cIn('message')], outputs:[cOut('status')],
    toSq: p=>`discord_send(${p.content_var})`,
  },

  // ── TRANSFORM +8 ──────────────────────────────────────────────────────
  {
    id:'window_transform', label:'Rolling Window', cat:'transform', color:'#D97706', icon:'⊡',
    info:'Rolling/sliding window: mean, std, sum, min, max, correlation.',
    params:[ps('data_var','Data variable','series'), pn('window_size','Window size',10,1,100000), psel('agg','Aggregation',['mean','std','sum','min','max','median','var'],'mean'), pb('center','Centred window',false), ps('output_var','Rolling result','rolling_result'), ...BYPASS],
    inputs:[cIn('data')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = rolling(${p.data_var}, ${p.window_size}, "${p.agg}")`,
  },
  {
    id:'resample_block', label:'Resample', cat:'transform', color:'#D97706', icon:'⇅',
    info:'Upsample or downsample time series data.',
    params:[ps('data_var','Data variable','ts'), ps('freq','Target frequency','1h'), psel('method','Resample method',['mean','sum','ffill','bfill','interpolate'],'mean'), ps('output_var','Resampled data','resampled'), ...BYPASS],
    inputs:[cIn('data')], outputs:[cOut('result')],
    toSq: p=>`let ${p.output_var} = resample(${p.data_var}, freq="${p.freq}", method="${p.method}")`,
  },
  {
    id:'encode_features', label:'Feature Encoding', cat:'transform', color:'#D97706', icon:'ENC',
    info:'Label encode, ordinal encode, target encode, leave-one-out encode.',
    params:[ps('X_var','Input data','X'), ps('col','Column name','category'), psel('method','Encoding',['label','ordinal','target','leave_one_out','weight_of_evidence'],'target'), ps('output_var','Encoded data','X_encoded'), ...BYPASS],
    inputs:[aIn('X')], outputs:[aOut('X_encoded')],
    toSq: p=>`let ${p.output_var} = encode(${p.X_var}, "${p.col}", method="${p.method}")`,
  },
  {
    id:'missing_impute', label:'Impute Missing', cat:'transform', color:'#D97706', icon:'?→v',
    info:'Handle missing values: mean/median/mode, KNN, MICE, iterative imputer.',
    params:[ps('data_var','Data variable','X'), psel('strategy','Strategy',['mean','median','mode','KNN','MICE','constant'],'median'), ps('fill_value','Constant fill value','0'), ps('output_var','Imputed data','X_imputed'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('imputed')],
    toSq: p=>`let ${p.output_var} = impute(${p.data_var}, strategy="${p.strategy}")`,
  },
  {
    id:'normalize_block', label:'Normalise / Scale', cat:'transform', color:'#D97706', icon:'[0,1]',
    info:'StandardScaler, MinMaxScaler, RobustScaler, Normalizer, PowerTransformer.',
    params:[ps('data_var','Data variable','X'), psel('scaler','Scaler',['StandardScaler','MinMaxScaler','RobustScaler','Normalizer','MaxAbsScaler','PowerTransformer'],'StandardScaler'), ps('output_var','Scaled data','X_scaled'), ...BYPASS],
    inputs:[aIn('X')], outputs:[aOut('scaled')],
    toSq: p=>`let ${p.output_var} = scale(${p.data_var}, method="${p.scaler}")`,
  },
  {
    id:'explode_block', label:'Explode / Flatten', cat:'transform', color:'#D97706', icon:'⊞→',
    info:'Explode list column into rows, or flatten nested JSON.',
    params:[ps('data_var','Data variable','data'), ps('column','Column to explode','tags'), pb('flatten_json','Flatten nested JSON',false), ps('output_var','Exploded data','exploded'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('result')],
    toSq: p=>`let ${p.output_var} = explode(${p.data_var}, "${p.column}")`,
  },
  {
    id:'dedup_block', label:'Deduplication', cat:'transform', color:'#D97706', icon:'⊘⊘',
    info:'Remove duplicate rows exactly or via fuzzy string matching.',
    params:[ps('data_var','Data variable','data'), ps('key_cols','Key columns (blank=all)',''), psel('method','Dedup method',['exact','fuzzy','blocked_fuzzy'],'exact'), pn('similarity_threshold','Fuzzy threshold',0.9,0.5,1), ps('output_var','Deduped data','deduped'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('deduped'), cOut('n_removed')],
    toSq: p=>`let ${p.output_var} = dedup(${p.data_var})`,
  },
  {
    id:'binning_block', label:'Binning / Discretise', cat:'transform', color:'#D97706', icon:'▐▐▐',
    info:'Discretise continuous variable into bins: equal-width, equal-frequency, custom.',
    params:[ps('data_var','Data variable','X'), ps('column','Column','age'), psel('strategy','Strategy',['uniform','quantile','kmeans','custom'],'quantile'), pn('n_bins','Bins',5,2,1000), ps('output_var','Binned data','X_binned'), ...BYPASS],
    inputs:[aIn('data')], outputs:[aOut('binned')],
    toSq: p=>`let ${p.output_var} = bin(${p.data_var}, "${p.column}", n=${p.n_bins})`,
  },

  // ── UTILITY +10 ───────────────────────────────────────────────────────
  {
    id:'parallel_map', label:'Parallel Map', cat:'utility', color:'#94A3B8', icon:'⇉MAP',
    info:'Apply function in parallel with multiprocessing pool.',
    params:[ps('fn_var','Function','process_fn'), ps('items_var','Items list','items'), pn('n_workers','Workers',4,1,256), psel('backend','Backend',['multiprocessing','threading','joblib','dask'],'joblib'), ps('output_var','Results','par_results'), ...BYPASS],
    inputs:[aIn('fn'), aIn('items')], outputs:[cOut('results')],
    toSq: p=>`let ${p.output_var} = parallel_map(${p.fn_var}, ${p.items_var}, workers=${p.n_workers})`,
  },
  {
    id:'cache_block', label:'Result Cache', cat:'utility', color:'#94A3B8', icon:'💾⚡',
    info:'Cache function results by input key. Redis, disk, or in-memory.',
    params:[ps('key_expr','Cache key expression','hash(input)'), pn('ttl_seconds','TTL (seconds, 0=forever)',0,0,86400*30), psel('backend','Cache backend',['in_memory','redis','disk'],'in_memory'), ps('output_var','Cached result','cached_result'), ...BYPASS],
    inputs:[aIn('fn'), aIn('input')], outputs:[aOut('result')],
    toSq: p=>`# cache(${p.key_expr}, ttl=${p.ttl_seconds})`,
  },
  {
    id:'progress_bar', label:'Progress Bar', cat:'utility', color:'#94A3B8', icon:'[===>]',
    info:'Show tqdm-style progress bar for long loops.',
    params:[ps('iterable_var','Iterable','items'), ps('description','Description','Processing'), pb('leave','Leave bar on finish',true), ps('output_var','Iteration variable','item'), ...BYPASS],
    inputs:[aIn('iterable')], outputs:[aOut('item')],
    toSq: p=>`for ${p.output_var} in progress(${p.iterable_var}, desc="${p.description}"):`,
  },
  {
    id:'feature_store', label:'Feature Store', cat:'utility', color:'#94A3B8', icon:'FS',
    info:'Register and retrieve ML features from Feast, Tecton, or Hopsworks.',
    params:[ps('feature_view','Feature view','user_features'), pj('entity_ids','Entity IDs','[1,2,3]'), psel('store','Feature store',['Feast','Tecton','Hopsworks','manual'],'Feast'), ps('output_var','Features','feature_df'), ...BYPASS],
    inputs:[], outputs:[cOut('features')],
    toSq: p=>`let ${p.output_var} = feature_store("${p.feature_view}")`,
  },
  {
    id:'experiment_tracker', label:'Experiment Tracker', cat:'utility', color:'#94A3B8', icon:'EXP',
    info:'Log experiments to MLflow, Weights&Biases, or Neptune.',
    params:[ps('run_name','Run name','vqe_experiment_1'), pj('params_to_log','Parameters to log','{"n_qubits":4}'), pj('metrics_to_log','Metrics to log','{"energy":-1.137}'), psel('platform','Platform',['MLflow','WandB','Neptune','ClearML','Comet'],'MLflow'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('run_id')],
    toSq: p=>`log_experiment("${p.run_name}", params=${p.params_to_log})`,
  },
  {
    id:'data_version', label:'Data Versioning', cat:'utility', color:'#94A3B8', icon:'DVC',
    info:'Version datasets and model artifacts with DVC, LakeFS, or Delta Lake.',
    params:[ps('data_var','Data or path','data'), psel('system','Versioning system',['DVC','LakeFS','Delta_Lake','git-annex'],'DVC'), ps('version_tag','Version tag','v1.0.0'), ps('message','Commit message','Add training data'), ...BYPASS],
    inputs:[aIn('data')], outputs:[cOut('version_id')],
    toSq: p=>`version_data(${p.data_var}, tag="${p.version_tag}")`,
  },
  {
    id:'env_detect', label:'Environment Detect', cat:'utility', color:'#94A3B8', icon:'ENV?',
    info:'Detect runtime environment: local, cloud, HPC cluster, Docker.',
    params:[ps('output_var','Environment info','env_info'), pb('log_details','Log details',true), ...BYPASS],
    inputs:[], outputs:[cOut('env_info')],
    toSq: p=>`let ${p.output_var} = detect_env()`,
  },
  {
    id:'conditional_skip', label:'Conditional Skip', cat:'utility', color:'#94A3B8', icon:'?SKIP',
    info:'Skip downstream blocks if condition is true (circuit breaker pattern).',
    params:[ps('condition','Skip condition','energy < -2.0'), pb('log_skip','Log skip reason',true), ps('skip_message','Log message','Skipping: converged'), ...BYPASS],
    inputs:[cIn('condition')], outputs:[aOut('pass')],
    toSq: p=>`if not (${p.condition}):  # conditional skip`,
  },
  {
    id:'format_number', label:'Format Number', cat:'utility', color:'#94A3B8', icon:'1.2e-3',
    info:'Format numbers for display: scientific, fixed, engineering, percentage.',
    params:[ps('value_var','Number variable','x'), psel('format','Format',['fixed','scientific','engineering','percentage','auto'],'auto'), pn('precision','Decimal places',4,0,15), ps('output_var','Formatted string','formatted'), ...BYPASS],
    inputs:[cIn('value')], outputs:[cOut('string')],
    toSq: p=>`let ${p.output_var} = fmt_number(${p.value_var}, "${p.format}", ${p.precision})`,
  },
  {
    id:'quantum_runtime', label:'Quantum Runtime Config', cat:'utility', color:'#94A3B8', icon:'QRT',
    info:'Configure the Sanskrit quantum runtime: max qubits, shard size, precision.',
    params:[pn('max_qubits','Max qubits',200,1,1000000), pn('shard_size','Shard size',10,2,20), psel('precision','Precision',['float64','float32','complex128'],'float64'), pb('gpu_acceleration','GPU acceleration',false), pb('distributed','Distributed shards',false), ...BYPASS],
    inputs:[], outputs:[],
    toSq: p=>`# quantum_runtime(max_q=${p.max_qubits}, shard=${p.shard_size})`,
  },

  // ── VARIABLE +4 ───────────────────────────────────────────────────────
  {
    id:'list_comprehension', label:'List Comprehension', cat:'variable', color:'#0D9488', icon:'[x|P]',
    info:'Generate list inline: [f(x) for x in items if condition]',
    params:[ps('expr','Expression f(x)','x*2'), ps('var','Iteration variable','x'), ps('iterable','Iterable','range(10)'), ps('condition','Filter condition (blank=none)',''), ps('output_var','Output list','result'), ...BYPASS],
    inputs:[], outputs:[cOut('list')],
    toSq: p=>`let ${p.output_var} = [${p.expr} for ${p.var} in ${p.iterable}${p.condition?' if '+p.condition:''}]`,
  },
  {
    id:'dict_comprehension', label:'Dict Comprehension', cat:'variable', color:'#0D9488', icon:'{k:v}',
    info:'Build dict inline: {k: v for k,v in items}',
    params:[ps('key_expr','Key expression','k'), ps('val_expr','Value expression','v'), ps('iterable','Iterable','items.items()'), ps('output_var','Output dict','result'), ...BYPASS],
    inputs:[], outputs:[cOut('dict')],
    toSq: p=>`let ${p.output_var} = {${p.key_expr}: ${p.val_expr} for ${p.key_expr},${p.val_expr} in ${p.iterable}}`,
  },
  {
    id:'unpack_block', label:'Unpack / Destructure', cat:'variable', color:'#0D9488', icon:'a,b=x',
    info:'Unpack tuple or list into multiple variables.',
    params:[ps('source_var','Source variable','result'), pj('target_vars','Target variable names','["a","b","c"]'), ...BYPASS],
    inputs:[aIn('source')], outputs:[cOut('unpacked')],
    toSq: p=>{ try{ const v=JSON.parse(p.target_vars); return `${v.join(', ')} = ${p.source_var}`; } catch{ return `a, b = ${p.source_var}`; }},
  },
  {
    id:'swap_vars', label:'Swap Variables', cat:'variable', color:'#0D9488', icon:'a⇄b',
    info:'Swap two variable values in place.',
    params:[ps('var_a','Variable A','a'), ps('var_b','Variable B','b'), ...BYPASS],
    inputs:[], outputs:[],
    toSq: p=>`${p.var_a}, ${p.var_b} = ${p.var_b}, ${p.var_a}`,
  },

  // ── LOGGING +4 ────────────────────────────────────────────────────────
  {
    id:'structured_log', label:'Structured Logger', cat:'logging', color:'#EAB308', icon:'{}📝',
    info:'Emit structured JSON log with arbitrary key-value fields.',
    params:[ps('level','Level','INFO'), pj('fields','Fields','{"step":1,"energy":-1.137}'), ps('msg','Message','step_complete'), psel('sink','Log sink',['console','file','elasticsearch','loki'],'console'), ...BYPASS],
    inputs:[aIn('data')], outputs:[],
    toSq: p=>`log_json("${p.level}", "${p.msg}", ${p.fields})`,
  },
  {
    id:'audit_log', label:'Audit Log', cat:'logging', color:'#EAB308', icon:'AUDIT',
    info:'Immutable audit trail for regulatory compliance.',
    params:[ps('action','Action','parameter_update'), ps('actor_var','Actor','user_id'), ps('resource_var','Resource','circuit_123'), pj('details','Details','{}'), ...BYPASS],
    inputs:[cIn('event')], outputs:[cOut('audit_id')],
    toSq: p=>`audit_log("${p.action}", actor=${p.actor_var})`,
  },
  {
    id:'performance_log', label:'Performance Log', cat:'logging', color:'#EAB308', icon:'⏱📝',
    info:'Log execution time, memory, and CPU for profiling.',
    params:[ps('label','Label','vqe_step'), pb('memory','Log memory',true), pb('cpu','Log CPU',true), ps('output_var','Perf data','perf_data'), ...BYPASS],
    inputs:[aIn()], outputs:[aOut(), cOut('perf')],
    toSq: p=>`# perf_log("${p.label}")`,
  },
  {
    id:'alert_block', label:'Alert / Notification', cat:'logging', color:'#EAB308', icon:'🔔',
    info:'Trigger alert when metric crosses threshold.',
    params:[ps('metric_var','Metric','energy'), psel('condition','Condition',['<','<=','>','>=','==','!='],'<'), pn('threshold','Threshold',-1.0), ps('alert_message','Alert message','Energy below threshold!'), psel('channel','Alert channel',['slack','email','pagerduty','console'],'console'), ...BYPASS],
    inputs:[cIn('metric')], outputs:[],
    toSq: p=>`if ${p.metric_var} ${p.condition} ${p.threshold}:\n    alert("${p.alert_message}")`,
  },

];
