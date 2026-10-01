import type {
  Site,
  FollowupQuestion,
  Observation,
  SiteHealthTimelinePoint,
} from '../types';

export const SAMPLE_SITES: Site[] = [
  {
    id: 'site-benevento',
    name: 'Benevento Catchment',
    description: 'Monitoring network across the Calore Irpino and its tributaries through the Benevento municipal zone, covering agricultural, forested and urban reaches.',
    waterbody: 'Calore Irpino & tributaries',
    city: 'Benevento',
    country: 'Italy',
    coordinates: { lat: 41.1298, lng: 14.7839 },
    subSites: [
      {
        code: 'B1', name: 'Calore — Ponte Valentino (upstream)',
        coordinates: { lat: 41.1350, lng: 14.7710 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-15', fishQuality: 'Good', fishRichness: 12, macroinvertebrateQuality: 'Good', macroinvertebrateRichness: 28, diatomQuality: 'Good', diatomRichness: 45, nitrate: 1.2, waterHealthRisk: 'Low' },
      },
      {
        code: 'B2', name: 'Sabato — Ponte Fusco',
        coordinates: { lat: 41.1180, lng: 14.8120 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-15', fishQuality: 'Moderate', fishRichness: 8, macroinvertebrateQuality: 'Moderate', macroinvertebrateRichness: 19, diatomQuality: 'Moderate', diatomRichness: 31, nitrate: 3.8, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'B3', name: 'Calore — Centro Storico',
        coordinates: { lat: 41.1298, lng: 14.7839 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-22', fishQuality: 'Moderate', fishRichness: 7, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: 14, diatomQuality: 'Moderate', diatomRichness: 27, nitrate: 5.1, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'B4', name: 'Tammaro — Casalduni',
        coordinates: { lat: 41.2100, lng: 14.7400 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-22', fishQuality: 'Good', fishRichness: 14, macroinvertebrateQuality: 'Good', macroinvertebrateRichness: 32, diatomQuality: 'Good', diatomRichness: 52, nitrate: 0.8, waterHealthRisk: 'Low' },
      },
      {
        code: 'B5', name: 'Calore — Confluenza Sabato',
        coordinates: { lat: 41.1240, lng: 14.8250 }, healthRisk: 'High',
        lastRecord: { date: '2026-09-28', fishQuality: 'Poor', fishRichness: 3, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: 8, diatomQuality: 'Poor', diatomRichness: 12, nitrate: 9.4, waterHealthRisk: 'High' },
      },
    ],
    baseline: { clarityScoreAvg: 74, clarityScoreStd: 10.1, debrisFrequency: 'occasional', typicalFlow: 'moderate' },
    recentObservationsCount: 41,
    activeAnomaliesCount: 1,
  },
  {
    id: 'site-coimbra',
    name: 'Coimbra Catchment',
    description: 'Mondego River and tributary network through the Coimbra urban and peri-urban zone, from forested headwaters to the tidal estuary reach.',
    waterbody: 'Mondego & tributaries',
    city: 'Coimbra',
    country: 'Portugal',
    coordinates: { lat: 40.2033, lng: -8.4264 },
    subSites: [
      {
        code: 'C1', name: 'Mondego — Penacova (upstream reference)',
        coordinates: { lat: 40.2670, lng: -8.2780 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-10', fishQuality: 'High', fishRichness: 16, macroinvertebrateQuality: 'Good', macroinvertebrateRichness: 34, diatomQuality: 'Good', diatomRichness: 58, nitrate: 0.5, waterHealthRisk: 'Low' },
      },
      {
        code: 'C2', name: 'Ceira — Ponte de Ceira',
        coordinates: { lat: 40.2150, lng: -8.3450 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-10', fishQuality: 'Good', fishRichness: 11, macroinvertebrateQuality: 'Good', macroinvertebrateRichness: 29, diatomQuality: 'Good', diatomRichness: 47, nitrate: 1.1, waterHealthRisk: 'Low' },
      },
      {
        code: 'C3', name: 'Mondego — Coimbra Cidade',
        coordinates: { lat: 40.2033, lng: -8.4264 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-18', fishQuality: 'Moderate', fishRichness: 9, macroinvertebrateQuality: 'Moderate', macroinvertebrateRichness: 22, diatomQuality: 'Moderate', diatomRichness: 35, nitrate: 4.2, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'C4', name: 'Figueira — Esteiro da Murta',
        coordinates: { lat: 40.1550, lng: -8.5200 }, healthRisk: 'High',
        lastRecord: { date: '2026-09-24', fishQuality: 'Poor', fishRichness: 4, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: 10, diatomQuality: 'Moderate', diatomRichness: 19, nitrate: 8.7, waterHealthRisk: 'High' },
      },
    ],
    baseline: { clarityScoreAvg: 69, clarityScoreStd: 12.3, debrisFrequency: 'occasional', typicalFlow: 'moderate' },
    recentObservationsCount: 55,
    activeAnomaliesCount: 0,
  },
  {
    id: 'site-ghent',
    name: 'Ghent Waterway Network',
    description: 'Urban canal and river network in Ghent including the Leie and Scheldt channels; monitored for combined sewer overflow (CSO) events, microplastics and nutrient loading.',
    waterbody: 'Leie / Scheldt network',
    city: 'Ghent',
    country: 'Belgium',
    coordinates: { lat: 51.0543, lng: 3.7174 },
    subSites: [
      {
        code: 'G1', name: 'Leie — Upstream (Deinze)',
        coordinates: { lat: 51.0050, lng: 3.5280 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-12', fishQuality: 'Good', fishRichness: 10, macroinvertebrateQuality: 'Moderate', macroinvertebrateRichness: 21, diatomQuality: 'Good', diatomRichness: 40, nitrate: 2.3, waterHealthRisk: 'Low' },
      },
      {
        code: 'G2', name: 'Leie — Historisch Centrum',
        coordinates: { lat: 51.0543, lng: 3.7174 }, healthRisk: 'High',
        lastRecord: { date: '2026-09-19', fishQuality: 'Poor', fishRichness: 3, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: 7, diatomQuality: 'Poor', diatomRichness: 14, nitrate: 11.2, waterHealthRisk: 'High' },
      },
      {
        code: 'G3', name: 'Scheldt — Merelbeke',
        coordinates: { lat: 51.0150, lng: 3.7650 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-19', fishQuality: 'Moderate', fishRichness: 7, macroinvertebrateQuality: 'Moderate', macroinvertebrateRichness: 16, diatomQuality: 'Moderate', diatomRichness: 28, nitrate: 6.1, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'G4', name: 'Moervaart — Destelbergen',
        coordinates: { lat: 51.0800, lng: 3.8200 }, healthRisk: 'Very high',
        lastRecord: { date: '2026-09-25', fishQuality: 'Poor', fishRichness: 1, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: 4, diatomQuality: 'Poor', diatomRichness: 9, nitrate: 18.4, waterHealthRisk: 'Very high' },
      },
      {
        code: 'G5', name: 'Leie — Afleiding (Canal)',
        coordinates: { lat: 51.0900, lng: 3.6800 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-25', fishQuality: 'Moderate', fishRichness: 6, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: 11, diatomQuality: 'Moderate', diatomRichness: 23, nitrate: 7.8, waterHealthRisk: 'Moderate' },
      },
    ],
    baseline: { clarityScoreAvg: 58, clarityScoreStd: 13.8, debrisFrequency: 'frequent', typicalFlow: 'slow' },
    recentObservationsCount: 63,
    activeAnomaliesCount: 3,
  },
  {
    id: 'site-oslo',
    name: 'Oslo Urban Rivers',
    description: 'Rehabilitated urban river corridors in Oslo including Akerselva and Alna; reference-quality bedrock streams with strong snowmelt hydrology and recovering macroinvertebrate communities.',
    waterbody: 'Akerselva / Alna',
    city: 'Oslo',
    country: 'Norway',
    coordinates: { lat: 59.9286, lng: 10.7512 },
    subSites: [
      {
        code: 'O1', name: 'Akerselva — Maridalsvannet (headwater)',
        coordinates: { lat: 59.9800, lng: 10.7600 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-08', fishQuality: 'High', fishRichness: 18, macroinvertebrateQuality: 'High', macroinvertebrateRichness: 42, diatomQuality: 'High', diatomRichness: 65, nitrate: 0.3, waterHealthRisk: 'Low' },
      },
      {
        code: 'O2', name: 'Akerselva — Sagene',
        coordinates: { lat: 59.9286, lng: 10.7512 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-08', fishQuality: 'Good', fishRichness: 13, macroinvertebrateQuality: 'Good', macroinvertebrateRichness: 35, diatomQuality: 'Good', diatomRichness: 55, nitrate: 0.7, waterHealthRisk: 'Low' },
      },
      {
        code: 'O3', name: 'Akerselva — Grünerløkka (urban)',
        coordinates: { lat: 59.9200, lng: 10.7490 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-15', fishQuality: 'Moderate', fishRichness: 8, macroinvertebrateQuality: 'Good', macroinvertebrateRichness: 26, diatomQuality: 'Good', diatomRichness: 44, nitrate: 2.1, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'O4', name: 'Alna — Haugerud (upstream)',
        coordinates: { lat: 59.9400, lng: 10.8300 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-20', fishQuality: 'Moderate', fishRichness: 6, macroinvertebrateQuality: 'Moderate', macroinvertebrateRichness: 18, diatomQuality: 'Moderate', diatomRichness: 30, nitrate: 3.6, waterHealthRisk: 'Moderate' },
      },
    ],
    baseline: { clarityScoreAvg: 88, clarityScoreStd: 6.4, debrisFrequency: 'rare', typicalFlow: 'rapid' },
    recentObservationsCount: 48,
    activeAnomaliesCount: 0,
  },
  {
    id: 'site-toulouse',
    name: 'Toulouse Garonne Network',
    description: 'Garonne River and its tributary network across the Toulouse metropolitan area, including multiple periurban and rural monitoring points covering the full urban-rural gradient.',
    waterbody: 'Garonne & tributaries',
    city: 'Toulouse',
    country: 'France',
    coordinates: { lat: 43.5990, lng: 1.4404 },
    subSites: [
      {
        code: 'T1', name: 'Garonne — Muret (upstream)',
        coordinates: { lat: 43.4700, lng: 1.3300 }, healthRisk: 'Low',
        lastRecord: { date: '2026-09-05', fishQuality: 'Good', fishRichness: 13, macroinvertebrateQuality: 'Good', macroinvertebrateRichness: 30, diatomQuality: 'Good', diatomRichness: 48, nitrate: 1.8, waterHealthRisk: 'Low' },
      },
      {
        code: 'T2', name: 'Touch — Plaisance-du-Touch',
        coordinates: { lat: 43.5600, lng: 1.3000 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-12', fishQuality: 'Moderate', fishRichness: 9, macroinvertebrateQuality: 'Moderate', macroinvertebrateRichness: 20, diatomQuality: 'Moderate', diatomRichness: 33, nitrate: 4.9, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'T3', name: 'Ruisseau de Bonneval amont',
        coordinates: { lat: 43.5500, lng: 1.3800 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-18', fishQuality: undefined, fishRichness: undefined, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: undefined, diatomQuality: 'Good', diatomRichness: undefined, nitrate: 0.39, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'T4', name: 'Garonne — Pont Neuf Toulouse',
        coordinates: { lat: 43.5990, lng: 1.4404 }, healthRisk: 'Moderate',
        lastRecord: { date: '2026-09-22', fishQuality: 'Moderate', fishRichness: 8, macroinvertebrateQuality: 'Moderate', macroinvertebrateRichness: 17, diatomQuality: 'Moderate', diatomRichness: 29, nitrate: 5.7, waterHealthRisk: 'Moderate' },
      },
      {
        code: 'T5', name: 'Marcaissonne aval',
        coordinates: { lat: 43.6200, lng: 1.5100 }, healthRisk: 'High',
        lastRecord: { date: '2026-09-25', fishQuality: 'Poor', fishRichness: 4, macroinvertebrateQuality: 'Poor', macroinvertebrateRichness: 9, diatomQuality: 'Poor', diatomRichness: 16, nitrate: 12.3, waterHealthRisk: 'High' },
      },
    ],
    baseline: { clarityScoreAvg: 65, clarityScoreStd: 14.7, debrisFrequency: 'occasional', typicalFlow: 'moderate' },
    recentObservationsCount: 72,
    activeAnomaliesCount: 2,
  },
];


// Curated 25-Question Adaptive Bank across all ecological indicators
export const QUESTION_BANK: FollowupQuestion[] = [
  // Turbidity / Clarity (1-4)
  {
    id: 'q-turbidity-depth',
    questionKey: 'water_clarity_depth',
    questionText: 'Can you see rocks or the streambed in water at knee depth (~0.5m)?',
    indicatorType: 'turbidity',
    options: [
      { label: 'Yes, clearly visible to bed', value: 'clearly_visible' },
      { label: 'Faint outline only', value: 'faint_outline' },
      { label: 'No, completely obscured by cloudiness', value: 'obscured' },
      { label: 'Water is too deep to tell safely', value: 'too_deep' },
    ],
  },
  {
    id: 'q-turbidity-color',
    questionKey: 'turbidity_tint',
    questionText: 'What color best describes the suspended cloudiness?',
    indicatorType: 'turbidity',
    options: [
      { label: 'Brown/silty clay', value: 'brown_silt' },
      { label: 'Milky or grayish', value: 'milky_grey' },
      { label: 'Greenish hue (algal)', value: 'green_hue' },
      { label: 'Tea-stained reddish/tannin', value: 'tannin' },
    ],
  },
  {
    id: 'q-turbidity-rain',
    questionKey: 'recent_precipitation',
    questionText: 'Has there been heavy rainfall in this catchment in the last 24 hours?',
    indicatorType: 'turbidity',
    options: [
      { label: 'Yes, heavy downpour', value: 'heavy_rain' },
      { label: 'Light shower only', value: 'light_rain' },
      { label: 'No, dry weather for multiple days', value: 'dry_weather' },
      { label: 'Unsure', value: 'unsure' },
    ],
  },
  {
    id: 'q-turbidity-duration',
    questionKey: 'turbidity_duration',
    questionText: 'Is this cloudiness normal for this location based on your experience?',
    indicatorType: 'turbidity',
    options: [
      { label: 'No, usually much clearer than this', value: 'abnormal' },
      { label: 'Yes, it usually looks this way', value: 'normal' },
      { label: 'First time visiting this site', value: 'first_visit' },
    ],
  },

  // Algal Bloom (5-8)
  {
    id: 'q-algae-type',
    questionKey: 'algae_appearance',
    questionText: 'What does the surface green material look like up close?',
    indicatorType: 'algal_bloom',
    options: [
      { label: 'Paint-like scum or floating blue-green streaks', value: 'paint_scum' },
      { label: 'Stringy green filaments attached to rocks', value: 'filamentous' },
      { label: 'Tiny floating leaf-like duckweed', value: 'duckweed' },
      { label: 'Brown/golden gelatinous mats', value: 'diatom_mat' },
    ],
  },
  {
    id: 'q-algae-odour',
    questionKey: 'algae_smell',
    questionText: 'Is there a noticeable pungent smell near the water surface?',
    indicatorType: 'algal_bloom',
    options: [
      { label: 'Strong musty, earthy, or septic odor', value: 'strong' },
      { label: 'Mild marshy odor', value: 'mild' },
      { label: 'No detectable smell', value: 'none' },
    ],
  },
  {
    id: 'q-algae-coverage',
    questionKey: 'algae_extent',
    questionText: 'Roughly what percentage of the observable water surface is covered?',
    indicatorType: 'algal_bloom',
    options: [
      { label: 'Scattered patches (< 10%)', value: 'isolated' },
      { label: 'Moderate band along edges (10% - 30%)', value: 'moderate' },
      { label: 'Extensive carpet across pool (> 30%)', value: 'extensive' },
    ],
  },
  {
    id: 'q-algae-wildlife',
    questionKey: 'algae_dead_animals',
    questionText: 'Do you notice any distressed wildlife, dead fish, or abnormal insect absence?',
    indicatorType: 'algal_bloom',
    options: [
      { label: 'Yes, dead fish or invertebrates visible', value: 'yes' },
      { label: 'Waterbirds actively avoiding water', value: 'avoidance' },
      { label: 'No signs of distressed fauna', value: 'no' },
    ],
  },

  // Floating Debris & Litter (9-12)
  {
    id: 'q-debris-type',
    questionKey: 'debris_composition',
    questionText: 'What is the dominant material among the floating debris?',
    indicatorType: 'floating_debris',
    options: [
      { label: 'Synthetic plastic bottles, bags & food packaging', value: 'macroplastics' },
      { label: 'Natural fallen branches, leaves & drift logs', value: 'natural_woody' },
      { label: 'Household bulky trash / tires / construction rubble', value: 'bulk_dumping' },
      { label: 'Styrofoam fragments / micro-litter', value: 'styrofoam' },
    ],
  },
  {
    id: 'q-debris-hazard',
    questionKey: 'debris_obstruction',
    questionText: 'Does the debris form a blockage or dam across the stream channel?',
    indicatorType: 'floating_debris',
    options: [
      { label: 'Yes, partial dam restricting flow', value: 'partial_dam' },
      { label: 'Yes, total blockage backing up stagnant water', value: 'total_blockage' },
      { label: 'No, debris drifts freely along edges', value: 'no_obstruction' },
    ],
  },
  {
    id: 'q-debris-origin',
    questionKey: 'discharge_pipe',
    questionText: 'Is there a stormwater outfall or drainage pipe directly near the debris accumulation?',
    indicatorType: 'floating_debris',
    options: [
      { label: 'Yes, pipe discharging right above pile', value: 'pipe_active' },
      { label: 'Drainage outlet present but dry', value: 'pipe_dry' },
      { label: 'No stormwater outlets within sight', value: 'none' },
      { label: 'Unsure', value: 'unsure' },
    ],
  },
  {
    id: 'q-debris-danger',
    questionKey: 'chemical_sheen',
    questionText: 'Do you see any rainbow oil sheen or oily slick radiating from the debris?',
    indicatorType: 'floating_debris',
    options: [
      { label: 'Yes, noticeable petroleum/rainbow colors', value: 'petroleum_sheen' },
      { label: 'Biological bacterial sheen (breaks into jagged plates when poked)', value: 'bio_sheen' },
      { label: 'No sheen visible', value: 'none' },
    ],
  },

  // Riparian Vegetation & Buffer (13-16)
  {
    id: 'q-buffer-width',
    questionKey: 'riparian_width',
    questionText: 'How wide is the vegetated tree/shrub buffer zone on the stream bank you are viewing?',
    indicatorType: 'riparian_vegetation',
    options: [
      { label: 'Continuous wide native corridor (> 15 meters)', value: 'wide_buffer' },
      { label: 'Narrow strip of trees/grass (3 to 15 meters)', value: 'narrow_buffer' },
      { label: 'Minimal or none (< 3m, manicured lawn or paving to edge)', value: 'degraded' },
    ],
  },
  {
    id: 'q-buffer-canopy',
    questionKey: 'canopy_shading',
    questionText: 'Approximately what percentage of the water surface is shaded by overhanging canopy?',
    indicatorType: 'riparian_vegetation',
    options: [
      { label: 'Heavy shade (> 60% of stream shaded)', value: 'heavy_shade' },
      { label: 'Moderate dappled shade (25% - 60%)', value: 'moderate_shade' },
      { label: 'Open sky, full direct sun exposure (< 25%)', value: 'open_sun' },
    ],
  },
  {
    id: 'q-buffer-weeds',
    questionKey: 'invasive_species',
    questionText: 'Are invasive weeds (e.g. blackberry, tradescantia, willow) choking the bank?',
    indicatorType: 'riparian_vegetation',
    options: [
      { label: 'Dominant invasive thicket covering banks', value: 'high_infestation' },
      { label: 'Scattered invasive weeds among natives', value: 'mixed' },
      { label: 'Predominantly healthy native flora', value: 'native_healthy' },
    ],
  },
  {
    id: 'q-buffer-erosion',
    questionKey: 'bank_erosion_state',
    questionText: 'Do you see exposed roots, collapsed soil, or vertical bare cliff faces along the bank?',
    indicatorType: 'riparian_vegetation',
    options: [
      { label: 'Severe active undercut or collapsing bank', value: 'severe_erosion' },
      { label: 'Minor exposed soil patches', value: 'minor_erosion' },
      { label: 'Stable, densely rooted bank', value: 'stable' },
    ],
  },

  // Flow Condition & Channel (17-20)
  {
    id: 'q-flow-velocity',
    questionKey: 'surface_movement',
    questionText: 'How quickly would a floating leaf travel over 5 meters?',
    indicatorType: 'flow_condition',
    options: [
      { label: 'Very brisk / turbulent rapids (< 3 seconds)', value: 'fast' },
      { label: 'Steady gentle glide (3 to 10 seconds)', value: 'moderate' },
      { label: 'Barely creeping or stagnant (> 10 seconds)', value: 'sluggish' },
      { label: 'Completely stationary pool', value: 'stationary' },
    ],
  },
  {
    id: 'q-flow-depth',
    questionKey: 'wetted_channel',
    questionText: 'Is the natural bed exposed with dry gravel bars or isolated pools?',
    indicatorType: 'flow_condition',
    options: [
      { label: 'Bank-to-bank full flow', value: 'bankfull' },
      { label: 'Moderate wetted channel with exposed side bars', value: 'normal_pool' },
      { label: 'Disconnected shallow pools only', value: 'isolated_pools' },
      { label: 'Completely dry bed', value: 'dry' },
    ],
  },
  {
    id: 'q-channel-lining',
    questionKey: 'artificial_lining',
    questionText: 'Is any portion of the stream bed or walls lined with artificial concrete or rock gabions?',
    indicatorType: 'concrete_channel',
    options: [
      { label: 'Completely concrete trapezoidal flume', value: 'full_concrete' },
      { label: 'Reinforced rock gabions / retaining walls on one side', value: 'partial_hard' },
      { label: 'Fully natural earthen/rocky bed', value: 'natural' },
    ],
  },
  {
    id: 'q-foam-sheen',
    questionKey: 'surface_foam_type',
    questionText: 'If foam is present on the water, how does it behave?',
    indicatorType: 'foam_sheen',
    options: [
      { label: 'Crisp white, billowy piles that smell like detergent', value: 'synthetic_detergent' },
      { label: 'Off-white/brownish thin froth gathered in natural eddies', value: 'natural_protein' },
      { label: 'No foam present', value: 'none' },
    ],
  },

  // Broader Ecological & Sanitary Context (21-25)
  {
    id: 'q-wildlife-presence',
    questionKey: 'indicator_wildlife',
    questionText: 'Do you observe active birds, dragonflies, frogs, or schooling native fish?',
    indicatorType: 'wildlife',
    options: [
      { label: 'Diverse wildlife observed (birds, frogs, insects)', value: 'rich' },
      { label: 'Only tolerant species (e.g. mosquito fish, flies)', value: 'tolerant_only' },
      { label: 'No wildlife observed in or near water', value: 'none' },
    ],
  },
  {
    id: 'q-human-contact',
    questionKey: 'recreation_contact',
    questionText: 'Are people or pets wading, swimming, or fishing at this site right now?',
    indicatorType: 'general',
    options: [
      { label: 'Yes, direct contact (swimming / dogs in water)', value: 'high_contact' },
      { label: 'Secondary contact only (kayaking / trail walking)', value: 'secondary' },
      { label: 'No people nearby', value: 'none' },
    ],
  },
  {
    id: 'q-water-odour',
    questionKey: 'specific_odour',
    questionText: 'Which phrase best matches any odor coming from the water?',
    indicatorType: 'general',
    options: [
      { label: 'Clean freshwater or damp soil', value: 'earthy_clean' },
      { label: 'Rotten eggs or sulfur (anaerobic mud)', value: 'sulfur' },
      { label: 'Raw sewage or septic waste', value: 'sewage' },
      { label: 'Petroleum, fuel, or chemical solvent', value: 'chemical' },
      { label: 'No detectable smell', value: 'none' },
    ],
  },
  {
    id: 'q-accessibility',
    questionKey: 'monitoring_safety',
    questionText: 'Was it safe and easy to reach the water edge for this observation?',
    indicatorType: 'general',
    options: [
      { label: 'Safe public viewing platform or graded path', value: 'accessible' },
      { label: 'Steep or slippery natural bank — required caution', value: 'cautious' },
      { label: 'Hazardous access (fenced off or overgrown)', value: 'hazardous' },
    ],
  },
  {
    id: 'q-confidence-self',
    questionKey: 'observer_confidence',
    questionText: 'How confident do you feel in identifying these stream conditions today?',
    indicatorType: 'general',
    options: [
      { label: 'High — I regularly visit and monitor this creek', value: 'high' },
      { label: 'Medium — doing my best to assess accurately', value: 'medium' },
      { label: 'Novice — first time doing environmental citizen monitoring', value: 'novice' },
    ],
  },
];

// Rich High-Quality Stream Demo Image Fixtures (Encoded as SVG Data URIs for offline independence)
export const DEMO_STREAM_IMAGE_GOOD = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="%237dd3fc"/>
      <stop offset="100%" stop-color="%23bae6fd"/>
    </linearGradient>
    <linearGradient id="streamTurbid" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="%2378350f"/>
      <stop offset="50%" stop-color="%23854d0e"/>
      <stop offset="100%" stop-color="%23a16207"/>
    </linearGradient>
    <linearGradient id="bankGreen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="%2315803d"/>
      <stop offset="100%" stop-color="%23166534"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(%23sky)"/>
  <path d="M0,220 Q400,200 800,240 L800,600 L0,600 Z" fill="url(%23bankGreen)"/>
  <!-- Meandering stream channel -->
  <path d="M120,600 C280,480 320,380 400,280 C440,240 460,230 480,230 C500,230 520,250 560,300 C620,380 680,490 800,600 Z" fill="url(%23streamTurbid)"/>
  <!-- Stream surface ripples & turbidity patches -->
  <ellipse cx="460" cy="380" rx="90" ry="25" fill="%23ca8a04" opacity="0.4"/>
  <ellipse cx="380" cy="440" rx="140" ry="35" fill="%23713f12" opacity="0.5"/>
  <ellipse cx="500" cy="480" rx="110" ry="28" fill="%23854d0e" opacity="0.3"/>
  <!-- Floating litter item -->
  <rect x="420" y="390" width="22" height="12" rx="3" fill="%23ffffff" stroke="%23dc2626" stroke-width="2"/>
  <circle cx="438" cy="396" r="3" fill="%232563eb"/>
  <!-- Riparian Trees -->
  <circle cx="140" cy="240" r="70" fill="%2314532d"/>
  <circle cx="230" cy="210" r="85" fill="%23166534"/>
  <circle cx="680" cy="220" r="95" fill="%2314532d"/>
  <circle cx="750" cy="270" r="80" fill="%2315803d"/>
  <!-- Rock edges -->
  <ellipse cx="280" cy="420" rx="30" ry="16" fill="%23475569"/>
  <ellipse cx="640" cy="450" rx="35" ry="18" fill="%23334155"/>
  <!-- Metadata overlay stamp -->
  <rect x="20" y="20" width="310" height="60" rx="8" fill="rgba(15,23,42,0.85)"/>
  <text x="35" y="44" fill="%2338bdf8" font-family="sans-serif" font-size="14" font-weight="bold">AquaGuard Field Stream Capture #1024</text>
  <text x="35" y="65" fill="%2394a3b8" font-family="sans-serif" font-size="12">Leie — Ghent — GPS: 51.0543, 3.7174 (Â±4m)</text>
</svg>`;

export const DEMO_STREAM_IMAGE_BLURRY = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
  <defs>
    <filter id="heavyBlur">
      <feGaussianBlur stdDeviation="18" />
    </filter>
  </defs>
  <rect width="800" height="600" fill="%23334155"/>
  <g filter="url(%23heavyBlur)">
    <circle cx="300" cy="250" r="220" fill="%230284c7" />
    <circle cx="500" cy="380" r="260" fill="%23166534" />
    <circle cx="400" cy="320" r="180" fill="%23854d0e" />
  </g>
  <rect x="20" y="20" width="330" height="60" rx="8" fill="rgba(15,23,42,0.85)"/>
  <text x="35" y="44" fill="%23f87171" font-family="sans-serif" font-size="14" font-weight="bold">Quality Alert: High Motion Blur Detected</text>
  <text x="35" y="65" fill="%2394a3b8" font-family="sans-serif" font-size="12">Laplacian Variance: 22.4 (Threshold: 60)</text>
</svg>`;

export const SEEDED_OBSERVATIONS: Observation[] = [
  {
    id: 'obs-golden-1024',
    localId: 'local-1727506800000',
    siteId: 'site-ghent-leie',
    siteName: 'Leie — Ghent Historic Waterway',
    observerId: 'user-citizen-01',
    observerName: 'Sarah Jenkins (Citizen #142)',
    status: 'REVIEW_REQUIRED',
    syncStatus: 'SYNCED',
    gps: { lat: 51.0543, lng: 3.7174, accuracy: 4.2 },
    observedAt: '2026-09-28T08:14:00Z',
    envObservations: {
      waterClarity: 'clear', // Conflict intentional with turbidity detection
      waterClarityScore: 85,
      odour: 'none',
      debris: 'none',
      flowRate: 'moderate',
      channelType: 'vegetated_banks',
      notes: 'Water seems clear from the quayside walkway, peaceful morning near the lock gate.',
    },
    qualityScore: 86,
    version: 1,
    media: [
      {
        id: 'media-1024-1',
        observationId: 'obs-golden-1024',
        url: DEMO_STREAM_IMAGE_GOOD,
        hash: 'sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1428500,
        captureTimestamp: '2026-09-28T08:12:45Z',
        gps: { lat: 51.0543, lng: 3.7174, accuracy: 4.2 },
        qualityScore: 86,
        qualityFactors: {
          blurScore: 88,
          blurPassed: true,
          brightnessScore: 84,
          brightnessPassed: true,
          occlusionScore: 89,
          occlusionPassed: true,
          streamRelevanceScore: 86,
          streamRelevancePassed: true,
          isDuplicate: false,
          duplicateSimilarity: 0.08,
        },
      },
    ],
    aiResult: {
      id: 'ai-res-1024',
      observationId: 'obs-golden-1024',
      model: 'gemini-1.5-pro-vision',
      modelVersion: '2026-v2',
      promptVersion: 'layer_b_evidence_v2.1',
      inputHash: 'sha256-4a5b6c7d8e9f',
      confidence: 74,
      confidenceFactors: {
        imageQuality: 86,
        aiEvidenceAgreement: 72,
        citizenConsistency: 60,
        gpsValidity: 95,
        historicalConsistency: 55,
      },
      explanation: {
        what: 'Water turbidity and isolated plastic debris detected',
        why: 'Reduced streambed visibility and elevated brown pixel distribution indicate turbidity (94% confidence) despite citizen report of clear water.',
        evidence: [
          'Region [0.28, 0.40]: Brown suspended sediment reduces optical clarity.',
          'Region [0.52, 0.65]: Floating synthetic beverage bottle detected with 72% confidence.',
          'Riparian buffer intact (94% confidence, native trees along left bank).',
        ],
        confidence: 74,
        nextAction: 'Flagged for human reviewer inspection due to citizen-AI clarity conflict and departure from site baseline.',
      },
      evidence: [
        {
          id: 'ev-1',
          indicator: 'turbidity',
          present: true,
          confidence: 0.94,
          severity: 'moderate',
          value: 'murky',
          reasoning: 'Water exhibits heavy brown suspended silts with streambed obscured at shallow depths.',
          imageRegion: { x: 0.35, y: 0.48, w: 0.35, h: 0.3, label: 'Turbidity Sediment' },
        },
        {
          id: 'ev-2',
          indicator: 'floating_debris',
          present: true,
          confidence: 0.72,
          severity: 'low',
          value: 'synthetic_litter',
          reasoning: 'White and blue synthetic bottle drifting near mid-channel eddy.',
          imageRegion: { x: 0.52, y: 0.65, w: 0.08, h: 0.05, label: 'Plastic Bottle' },
        },
        {
          id: 'ev-3',
          indicator: 'riparian_vegetation',
          present: true,
          confidence: 0.94,
          severity: 'low',
          value: 'dense',
          reasoning: 'Dense canopy cover with eucalyptus trees along stream banks.',
          imageRegion: { x: 0.05, y: 0.25, w: 0.3, h: 0.45, label: 'Riparian Trees' },
        },
        {
          id: 'ev-4',
          indicator: 'flow_condition',
          present: true,
          confidence: 0.86,
          value: 'flowing',
          reasoning: 'Ripples and surface trajectory show active stream movement.',
        },
      ],
      validationWarnings: [
        {
          id: 'warn-1024-1',
          type: 'CITIZEN_AI_CONFLICT',
          severity: 'HIGH',
          citizenAnswer: 'Water Clarity: clear',
          aiDetection: 'Turbidity: murky (94% confidence)',
          confidence: 0.94,
          explanation: {
            what: 'Potential contradiction in water clarity answer',
            why: 'You selected "clear water", but the AI vision analysis detected cloudy, suspended silt with 94% confidence.',
            nextAction: 'Please inspect the water closer to the surface or update your clarity response.',
          },
          resolved: false,
        },
        {
          id: 'warn-1024-2',
          type: 'HISTORICAL_ANOMALY',
          severity: 'MEDIUM',
          citizenAnswer: 'Reported conditions',
          aiDetection: 'Historical Clarity Shift',
          confidence: 0.82,
          explanation: {
            what: 'Significant departure from historical baseline',
            why: 'Last 5 observations at Ghent Leie reported high clarity (mean 58). Current evidence indicates sudden drop (Z-Score: 2.38), potentially linked to a combined sewer overflow event.',
            nextAction: 'Requires expert verification to confirm CSO runoff pulse.',
          },
          resolved: false,
        },
      ],
      routingDecision: 'REVIEW_REQUIRED',
      createdAt: '2026-09-28T08:15:30Z',
    },
    followupQuestions: [
      {
        id: 'q-turbidity-depth',
        questionKey: 'water_clarity_depth',
        questionText: 'Can you see rocks or the streambed in water at knee depth (~0.5m)?',
        indicatorType: 'turbidity',
        options: [
          { label: 'Yes, clearly visible to bed', value: 'clearly_visible' },
          { label: 'Faint outline only', value: 'faint_outline' },
          { label: 'No, completely obscured by cloudiness', value: 'obscured' },
          { label: 'Water is too deep to tell safely', value: 'too_deep' },
        ],
        citizenAnswer: 'faint_outline',
        aiSuggestedAnswer: 'obscured',
      },
      {
        id: 'q-debris-type',
        questionKey: 'debris_composition',
        questionText: 'What is the dominant material among the floating debris?',
        indicatorType: 'floating_debris',
        options: [
          { label: 'Synthetic plastic bottles, bags & food packaging', value: 'macroplastics' },
          { label: 'Natural fallen branches, leaves & drift logs', value: 'natural_woody' },
          { label: 'Household bulky trash / tires / construction rubble', value: 'bulk_dumping' },
          { label: 'Styrofoam fragments / micro-litter', value: 'styrofoam' },
        ],
        citizenAnswer: 'macroplastics',
        aiSuggestedAnswer: 'macroplastics',
      },
      {
        id: 'q-buffer-width',
        questionKey: 'riparian_width',
        questionText: 'How wide is the vegetated tree/shrub buffer zone on the stream bank you are viewing?',
        indicatorType: 'riparian_vegetation',
        options: [
          { label: 'Continuous wide native corridor (> 15 meters)', value: 'wide_buffer' },
          { label: 'Narrow strip of trees/grass (3 to 15 meters)', value: 'narrow_buffer' },
          { label: 'Minimal or none (< 3m, manicured lawn or paving to edge)', value: 'degraded' },
        ],
        citizenAnswer: 'wide_buffer',
        aiSuggestedAnswer: 'wide_buffer',
      },
      {
        id: 'q-water-odour',
        questionKey: 'specific_odour',
        questionText: 'Which phrase best matches any odor coming from the water?',
        indicatorType: 'general',
        options: [
          { label: 'Clean freshwater or damp soil', value: 'earthy_clean' },
          { label: 'Rotten eggs or sulfur (anaerobic mud)', value: 'sulfur' },
          { label: 'Raw sewage or septic waste', value: 'sewage' },
          { label: 'Petroleum, fuel, or chemical solvent', value: 'chemical' },
          { label: 'No detectable smell', value: 'none' },
        ],
        citizenAnswer: 'earthy_clean',
        aiSuggestedAnswer: 'earthy_clean',
      },
    ],
    historyTimeline: [
      { date: 'Aug 14, 2026', clarity: 'Crystal Clear (92)', status: 'ACCEPTED' },
      { date: 'Aug 28, 2026', clarity: 'Clear (85)', status: 'ACCEPTED' },
      { date: 'Sep 07, 2026', clarity: 'Slightly Cloudy (74)', status: 'ACCEPTED' },
      { date: 'Sep 15, 2026', clarity: 'Clear (82)', status: 'ACCEPTED' },
      { date: 'Sep 28, 2026', clarity: 'Murky (42) — Current', status: 'REVIEW_REQUIRED' },
    ],
    createdAt: '2026-09-28T08:14:00Z',
    updatedAt: '2026-09-28T08:15:30Z',
  },
  {
    id: 'obs-valid-1025',
    localId: 'local-1727510400000',
    siteId: 'site-oslo-akerselva',
    siteName: 'Akerselva — Oslo Sagene Reach',
    observerId: 'user-citizen-02',
    observerName: 'Marcus Chen',
    status: 'VALID',
    syncStatus: 'SYNCED',
    gps: { lat: 59.9286, lng: 10.7512, accuracy: 3.1 },
    observedAt: '2026-09-29T10:30:00Z',
    envObservations: {
      waterClarity: 'slightly_cloudy',
      waterClarityScore: 68,
      odour: 'none',
      debris: 'natural_only',
      flowRate: 'rapid',
      channelType: 'vegetated_banks',
      notes: 'Water levels normal after spring snowmelt, river rushing through the mill-race bedrock section.',
    },
    qualityScore: 92,
    version: 1,
    media: [
      {
        id: 'media-1025-1',
        observationId: 'obs-valid-1025',
        url: DEMO_STREAM_IMAGE_GOOD,
        hash: 'sha256-abcdef0123456789',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1820400,
        captureTimestamp: '2026-09-29T10:28:10Z',
        qualityScore: 92,
        qualityFactors: {
          blurScore: 94,
          blurPassed: true,
          brightnessScore: 90,
          brightnessPassed: true,
          occlusionScore: 95,
          occlusionPassed: true,
          streamRelevanceScore: 92,
          streamRelevancePassed: true,
          isDuplicate: false,
          duplicateSimilarity: 0.02,
        },
      },
    ],
    aiResult: {
      id: 'ai-res-1025',
      observationId: 'obs-valid-1025',
      model: 'gemini-1.5-pro-vision',
      modelVersion: '2026-v2',
      promptVersion: 'layer_b_evidence_v2.1',
      inputHash: 'sha256-9876543210ab',
      confidence: 89,
      confidenceFactors: {
        imageQuality: 92,
        aiEvidenceAgreement: 88,
        citizenConsistency: 95,
        gpsValidity: 98,
        historicalConsistency: 85,
      },
      explanation: {
        what: 'High consistency observation with baseline agreement',
        why: 'Citizen reports of rapid flow, slightly cloudy water, and natural woody debris align closely with AI evidence models.',
        evidence: [
          'Flow rate verified as rapid based on surface white water texture.',
          'No synthetic litter or algal blooms detected.',
          'Historical alignment within 0.4 standard deviations.',
        ],
        confidence: 89,
        nextAction: 'Auto-accepted into validated stream dataset.',
      },
      evidence: [
        {
          id: 'ev-1025-1',
          indicator: 'flow_condition',
          present: true,
          confidence: 0.95,
          value: 'rapid',
          reasoning: 'Standing waves and surface turbulence confirm rapid weir discharge.',
        },
        {
          id: 'ev-1025-2',
          indicator: 'floating_debris',
          present: false,
          confidence: 0.92,
          value: 'natural_only',
          reasoning: 'Only floating organic sticks detected near eddy.',
        },
      ],
      validationWarnings: [],
      routingDecision: 'VALID',
      createdAt: '2026-09-29T10:32:00Z',
    },
    followupQuestions: [],
    createdAt: '2026-09-29T10:30:00Z',
    updatedAt: '2026-09-29T10:32:00Z',
  },
  {
    id: 'obs-human-1026',
    localId: 'local-1727514000000',
    siteId: 'site-toulouse-garonne',
    siteName: 'Garonne — Toulouse Pont Neuf',
    observerId: 'user-citizen-03',
    observerName: 'Elena Rostova',
    status: 'HUMAN_REVIEW',
    syncStatus: 'SYNCED',
    gps: { lat: 43.5990, lng: 1.4404, accuracy: 12.0 },
    observedAt: '2026-09-30T14:10:00Z',
    envObservations: {
      waterClarity: 'opaque',
      waterClarityScore: 25,
      odour: 'chemical',
      debris: 'heavy_dumping',
      flowRate: 'stagnant',
      channelType: 'concrete_channel',
      notes: 'Strange pungent chemical smell near the storm outfall under Pont Neuf. Vivid green slick on slow-moving surface.',
    },
    qualityScore: 79,
    version: 1,
    media: [
      {
        id: 'media-1026-1',
        observationId: 'obs-human-1026',
        url: DEMO_STREAM_IMAGE_GOOD,
        hash: 'sha256-554433221100',
        mimeType: 'image/jpeg',
        fileSizeBytes: 1205000,
        captureTimestamp: '2026-09-30T14:08:00Z',
        qualityScore: 79,
        qualityFactors: {
          blurScore: 82,
          blurPassed: true,
          brightnessScore: 76,
          brightnessPassed: true,
          occlusionScore: 80,
          occlusionPassed: true,
          streamRelevanceScore: 85,
          streamRelevancePassed: true,
          isDuplicate: false,
          duplicateSimilarity: 0.05,
        },
      },
    ],
    aiResult: {
      id: 'ai-res-1026',
      observationId: 'obs-human-1026',
      model: 'gemini-1.5-pro-vision',
      modelVersion: '2026-v2',
      promptVersion: 'layer_b_evidence_v2.1',
      inputHash: 'sha256-1122334455',
      confidence: 52,
      confidenceFactors: {
        imageQuality: 79,
        aiEvidenceAgreement: 58,
        citizenConsistency: 45,
        gpsValidity: 70,
        historicalConsistency: 20,
      },
      explanation: {
        what: 'Critical chemical/algal anomaly alert flagged',
        why: 'Severe drop in clarity accompanied by chemical odour report and heavy surface slick. Z-score 3.4 standard deviations from baseline.',
        evidence: [
          'High probability algal bloom or illicit industrial discharge.',
          'Stagnant flow condition with surface foam accumulation.',
        ],
        confidence: 52,
        nextAction: 'Urgent human review and environmental protection agency dispatch recommended.',
      },
      evidence: [
        {
          id: 'ev-1026-1',
          indicator: 'algal_bloom',
          present: true,
          confidence: 0.88,
          severity: 'high',
          value: 'present',
          reasoning: 'Bright green surface mat covering slow moving bend.',
        },
        {
          id: 'ev-1026-2',
          indicator: 'foam_sheen',
          present: true,
          confidence: 0.79,
          severity: 'moderate',
          value: 'chemical',
          reasoning: 'Oily rainbow iridescence detected along fringe.',
        },
      ],
      validationWarnings: [
        {
          id: 'warn-1026-1',
          type: 'HISTORICAL_ANOMALY',
          severity: 'HIGH',
          citizenAnswer: 'Chemical odour + opaque water',
          aiDetection: 'Severe Anomaly (Z=3.41)',
          confidence: 0.95,
          explanation: {
            what: 'Acute pollution pulse suspected',
            why: 'Garonne at Toulouse baseline clarity is normally 65. Current rating 25 is an extreme statistical anomaly — consistent with an agricultural or industrial discharge event upstream.',
            nextAction: 'Mandatory human reviewer verification and EPA notification.',
          },
          resolved: false,
        },
      ],
      routingDecision: 'HUMAN_REVIEW',
      createdAt: '2026-09-30T14:12:00Z',
    },
    followupQuestions: [],
    createdAt: '2026-09-30T14:10:00Z',
    updatedAt: '2026-09-30T14:12:00Z',
  },
];

// Historical Longitudinal Data for Site Health Visualizations
// Primary reference site: Leie — Ghent (most observations, active anomalies)
export const GHENT_LEIE_TIMELINE: SiteHealthTimelinePoint[] = [
  { week: 'W31', dateLabel: 'Aug 03', observationCount: 8, avgQuality: 82, avgClarity: 62, debrisReportsCount: 1, algaeDetectedCount: 0, isAnomaly: false, zScore: 0.4 },
  { week: 'W32', dateLabel: 'Aug 10', observationCount: 10, avgQuality: 85, avgClarity: 65, debrisReportsCount: 0, algaeDetectedCount: 0, isAnomaly: false, zScore: 0.2 },
  { week: 'W33', dateLabel: 'Aug 17', observationCount: 9, avgQuality: 80, avgClarity: 61, debrisReportsCount: 2, algaeDetectedCount: 0, isAnomaly: false, zScore: 0.6 },
  { week: 'W34', dateLabel: 'Aug 24', observationCount: 12, avgQuality: 86, avgClarity: 59, debrisReportsCount: 1, algaeDetectedCount: 0, isAnomaly: false, zScore: 0.5 },
  { week: 'W35', dateLabel: 'Aug 31', observationCount: 11, avgQuality: 84, avgClarity: 57, debrisReportsCount: 3, algaeDetectedCount: 1, isAnomaly: false, zScore: 0.9 },
  { week: 'W36', dateLabel: 'Sep 07', observationCount: 14, avgQuality: 88, avgClarity: 53, debrisReportsCount: 4, algaeDetectedCount: 1, isAnomaly: false, zScore: 1.2 },
  { week: 'W37', dateLabel: 'Sep 14', observationCount: 15, avgQuality: 83, avgClarity: 45, debrisReportsCount: 6, algaeDetectedCount: 2, isAnomaly: true, zScore: 2.1 },
  { week: 'W38', dateLabel: 'Sep 21', observationCount: 18, avgQuality: 87, avgClarity: 36, debrisReportsCount: 8, algaeDetectedCount: 3, isAnomaly: true, zScore: 2.6 },
  { week: 'W39', dateLabel: 'Sep 28', observationCount: 22, avgQuality: 85, avgClarity: 28, debrisReportsCount: 11, algaeDetectedCount: 4, isAnomaly: true, zScore: 2.9 },
];

// Alias kept for backward compatibility with any existing imports
export const MERRI_CREEK_TIMELINE = GHENT_LEIE_TIMELINE;
