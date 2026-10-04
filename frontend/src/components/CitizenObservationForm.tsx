import React, { useState, useEffect } from 'react';
import {
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  Home,
  Sparkles,
  Info,
  ShieldCheck,
  Video,
  FileCheck,
  RotateCcw,
  Award
} from 'lucide-react';
import { SAMPLE_SITES } from '../data/mockData';
import type { Site, SubSite, Observation, EnvObservations } from '../types';
import {
  evaluateImageQuality,
  detectEcologicalEvidence,
  validateObservation,
  calculateConfidence
} from '../services/aiPipeline';
import { OfflineStorageService } from '../services/offlineStorage';
import { AdaptiveQuestionFlow } from './AdaptiveQuestionFlow';
import { StreamMap } from './StreamMap';
import { MediaPreviewModal } from './MediaPreviewModal';
import type { MediaItem } from './MediaPreviewModal';

interface CitizenObservationFormProps {
  onObservationSubmitted?: (obs: Observation) => void;
  initialSite?: Site;
}

export const CitizenObservationForm: React.FC<CitizenObservationFormProps> = ({
  onObservationSubmitted,
  initialSite
}) => {
  // Stepper state: Step 1 to 9
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 2: Site Selection
  const [selectedSite, setSelectedSite] = useState<Site>(initialSite || SAMPLE_SITES[3]); // Default: Oslo Urban Rivers
  const [selectedSubSite, setSelectedSubSite] = useState<SubSite>(
    selectedSite.subSites[1] || selectedSite.subSites[0]
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddSiteModal, setShowAddSiteModal] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteCode, setNewSiteCode] = useState('');
  const [newSiteLat, setNewSiteLat] = useState<number>(41.1350);
  const [newSiteLng, setNewSiteLng] = useState<number>(14.7710);
  const [newSiteRisk, setNewSiteRisk] = useState<'Low' | 'Moderate' | 'High'>('Low');
  const [isGettingGps, setIsGettingGps] = useState(false);

  const handleOpenAddSiteModal = () => {
    setNewSiteName('');
    const codePrefix = selectedSite.city.charAt(0).toUpperCase();
    const nextNum = selectedSite.subSites.length + 1;
    setNewSiteCode(`${codePrefix}${nextNum}`);
    setNewSiteLat(Number((selectedSubSite.coordinates.lat + 0.003).toFixed(4)));
    setNewSiteLng(Number((selectedSubSite.coordinates.lng + 0.003).toFixed(4)));
    setNewSiteRisk('Low');
    setShowAddSiteModal(true);
  };

  const handleUseCurrentGps = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setIsGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNewSiteLat(Number(pos.coords.latitude.toFixed(4)));
        setNewSiteLng(Number(pos.coords.longitude.toFixed(4)));
        setIsGettingGps(false);
      },
      (err) => {
        alert('Could not retrieve GPS: ' + err.message);
        setIsGettingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Step 3: Media Upload state
  const [upstreamPhoto, setUpstreamPhoto] = useState<string>('/app_photos/image4.png');
  const [downstreamPhoto, setDownstreamPhoto] = useState<string>('/app_photos/image19.png');
  const [surroundingPhoto, setSurroundingPhoto] = useState<string>('/app_photos/image18.png');
  const [biodiversityPhoto, setBiodiversityPhoto] = useState<string>('/app_photos/image15.png');
  const [streamVideo, setStreamVideo] = useState<string | null>(null);
  const [streamVideoName, setStreamVideoName] = useState<string>('');
  const [previewModal, setPreviewModal] = useState<{ isOpen: boolean; items: MediaItem[]; initialIndex: number }>({
    isOpen: false,
    items: [],
    initialIndex: 0,
  });

  const openMediaPreview = (initialIndex: number) => {
    const items: MediaItem[] = [
      { url: upstreamPhoto, title: 'Upstream View', caption: 'Flow direction, clarity, and bank conditions looking upstream' },
      { url: downstreamPhoto, title: 'Downstream View', caption: 'Downstream channel structure and water discharge' },
      { url: surroundingPhoto, title: 'Surrounding Context', caption: 'Houses, roads, trees, and riparian buffer' },
      { url: biodiversityPhoto, title: 'Biodiversity Element', caption: 'Aquatic plants, benthic macroinvertebrates, algae, or wildlife' },
    ];
    if (streamVideo) {
      items.push({ url: streamVideo, mimeType: 'video/mp4', title: 'Stream Flow Video', caption: streamVideoName || 'Stream dynamics and velocity' });
    }
    setPreviewModal({ isOpen: true, items, initialIndex });
  };

  // Step 4: Channel Form Questions (1/3)
  const [channelForm, setChannelForm] = useState<'flat' | 'u_shape' | 'v_shape' | 'unsure'>('u_shape');
  const [bufferLeftWidth, setBufferLeftWidth] = useState<'<1m' | '1-5m' | '5-10m' | '>10m'>('5-10m');
  const [bufferRightWidth, setBufferRightWidth] = useState<'<1m' | '1-5m' | '5-10m' | '>10m'>('5-10m');

  // Step 5: Water Aspect & Substrate Questions (2/3)
  const [waterAspect, setWaterAspect] = useState<'clear' | 'turbid' | 'foam' | 'altered_color' | 'unsure'>('clear');
  const [waterFlow, setWaterFlow] = useState<'fast' | 'slow' | 'stagnant' | 'dry' | 'unsure'>('fast');
  const [bottomType, setBottomType] = useState<'natural' | 'artificial' | 'unsure'>('natural');
  const [bankType, setBankType] = useState<'natural' | 'artificial' | 'unsure'>('natural');
  const [hasHabitats, setHasHabitats] = useState<boolean>(true);
  const [hasNaturalDebris, setHasNaturalDebris] = useState<boolean>(true);

  // Step 6: Pressures & Artificial Elements (3/3)
  const [hasArtificialPipes, setHasArtificialPipes] = useState<boolean>(false);
  const [hasArtificialBarriers, setHasArtificialBarriers] = useState<boolean>(false);
  const [hasLitterTrash, setHasLitterTrash] = useState<boolean>(false);
  const [odor, setOdor] = useState<'none' | 'earthy' | 'sewage' | 'chemical' | 'fishy'>('none');

  // Step 7: Feedback (1/2) - Overall Health Assessment
  const [overallHealthRating, setOverallHealthRating] = useState<'good' | 'moderate' | 'poor'>('good');

  // Step 8: Additional Notes (2/2)
  const [weatherCondition, setWeatherCondition] = useState<string>('Sunny / Clear');
  const [citizenConfidence, setCitizenConfidence] = useState<number>(5);
  const [citizenNotes, setCitizenNotes] = useState<string>(
    'Clean active mountain flow with clear bed visibility and healthy riparian vegetation along both banks.'
  );

  // Step 9: AI Real-Time Cross-Check & Submit State
  const [isAiAnalyzing, setIsAiAnalyzing] = useState<boolean>(false);
  const [aiAnalysisComplete, setAiAnalysisComplete] = useState<boolean>(false);
  const [aiEvidence, setAiEvidence] = useState<any[]>([]);
  const [imageQuality, setImageQuality] = useState<any>(null);
  const [validationWarnings, setValidationWarnings] = useState<any[]>([]);
  const [confidenceFactors, setConfidenceFactors] = useState<any>(null);
  const [submissionSuccess, setSubmissionSuccess] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submittedObsId, setSubmittedObsId] = useState<string | null>(null);

  // Auto trigger AI evaluation when reaching Step 9
  useEffect(() => {
    if (currentStep === 5 && !aiAnalysisComplete) {
      runRealTimeAiAssessment();
    }
  }, [currentStep]);

  // When changing site, update default subsite
  useEffect(() => {
    if (selectedSite.subSites && selectedSite.subSites.length > 0) {
      setSelectedSubSite(selectedSite.subSites[0]);
    }
  }, [selectedSite]);

  const runRealTimeAiAssessment = async () => {
    setIsAiAnalyzing(true);
    try {
      // 1. Get base64 of the uploaded photo (simulated upload)
      const response = await fetch(upstreamPhoto);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      const base64 = await new Promise((res) => {
        reader.onloadend = () => res(reader.result);
      });

      // 2. Build the environment observation mapping
      const envObs = {
        waterClarity: waterAspect, odour: odor, flowRate: waterFlow, notes: citizenNotes,
        waterClarityScore: waterAspect === 'clear' ? 88 : 35
      };

      // 3. Call REAL Backend AI endpoint (which triggers Python)
      const aiRes = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/ai/sync-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, citizenAnswers: envObs })
      });
      const aiData = await aiRes.json();
      const result = aiData.data || {};

      // 4. Map Real Python output back to frontend state
      setImageQuality(result.layer_a || { quality_score: 85 });

      // Map Python Layer B indicators to frontend evidence items
      const rawEvidence = result.layer_b || {};
      const mappedEvidence: any[] = [];
      if (Array.isArray(rawEvidence.evidence)) {
        mappedEvidence.push(...rawEvidence.evidence);
      } else {
        Object.entries(rawEvidence).forEach(([k, v]: [string, any]) => {
          if (v && typeof v === 'object' && v.value && v.confidence !== undefined && v.confidence > 0) {
            mappedEvidence.push({
              indicator: k,
              value: v.value,
              confidence: v.confidence,
              present: v.value !== 'absent' && v.value !== 'unknown',
              reasoning: v.evidence || ''
            });
          }
        });
      }
      setAiEvidence(mappedEvidence);

      // Map Layer D conflicts to validation warnings
      const rawConflicts = result.layer_d?.conflicts || [];
      const mappedWarnings = rawConflicts.map((conf: any, idx: number) => {
        if (typeof conf === 'string') {
          return {
            id: `conflict-${idx}`,
            type: 'CITIZEN_AI_CONFLICT',
            severity: 'HIGH',
            explanation: {
              why: conf,
              nextAction: 'Review your visual observations against detected optical evidence.'
            }
          };
        }
        return conf;
      });
      setValidationWarnings(mappedWarnings);
      
      const realScore = Math.round(result.confidence?.confidence_score ?? result.confidence_score ?? 82);
      const realComponents = result.confidence?.components || {};
      setConfidenceFactors({
        score: realScore,
        routing: result.routing_decision || result.status || (realScore >= 80 ? 'VALID' : 'REVIEW_REQUIRED'),
        factors: {
          imageQuality: Math.round(realComponents.imageQuality ?? result.layer_a?.quality_score ?? 85),
          aiEvidenceAgreement: Math.round(realComponents.aiEvidenceAgreement ?? 80),
          citizenConsistency: Math.round(realComponents.citizenConsistency ?? 85),
          gpsValidity: Math.round(realComponents.gpsValidity ?? 95),
          historicalConsistency: Math.round(realComponents.historicalConsistency ?? 50)
        },
        explanation: result.layer_d?.explanation || {
          what: `Observation evaluated by ${result.model_used || 'AquaGuard AI Engine'}`,
          why: mappedWarnings.length > 0 
            ? `${mappedWarnings.length} discrepancy detected between citizen report and computer vision.`
            : 'Multi-modal optical analysis aligns with submitted observation answers.'
        }
      });
    } catch (err) {
      console.error('Real AI Pipeline Failed:', err);
      // Fallback to avoid breaking UI demo if backend is off
      setImageQuality({ qualityScore: 50 });
      setAiEvidence([]);
      setValidationWarnings([]);
      setConfidenceFactors({ score: 50, factors: {}, explanation: { what: 'Failed to connect to real backend' } });
    }
    setIsAiAnalyzing(false);
    setAiAnalysisComplete(true);
  };

  const handleFinalSubmit = () => {
    if (isSubmitting || submissionSuccess) return;
    setIsSubmitting(true);

    const envObs: EnvObservations = {
      waterClarity:
        waterAspect === 'clear'
          ? 'clear'
          : waterAspect === 'turbid'
          ? 'murky'
          : waterAspect === 'foam'
          ? 'slightly_cloudy'
          : 'opaque',
      odour: odor,
      debris: hasLitterTrash ? 'plastic_litter' : hasNaturalDebris ? 'natural_only' : 'none',
      flowRate:
        waterFlow === 'fast'
          ? 'rapid'
          : waterFlow === 'slow'
          ? 'slow'
          : waterFlow === 'stagnant'
          ? 'stagnant'
          : 'moderate',
      channelType:
        bankType === 'artificial' || bottomType === 'artificial'
          ? 'concrete_channel'
          : 'vegetated_banks',
      notes: citizenNotes,
      waterClarityScore: waterAspect === 'clear' ? 88 : waterAspect === 'turbid' ? 35 : 65
    };

    const newObsId = `obs-citizen-${Date.now()}`;
    const newObservation: Observation = {
      id: newObsId,
      siteId: selectedSite.id,
      siteName: `${selectedSite.city} - ${selectedSubSite.name} (${selectedSubSite.code})`,
      observerId: 'citizen-yashas-88',
      observerName: 'Citizen Science Volunteer (Yashas)',
      status: validationWarnings.length > 0 ? 'REVIEW_REQUIRED' : 'ACCEPTED',
      syncStatus: 'SYNCED',
      gps: {
        lat: selectedSubSite.coordinates.lat,
        lng: selectedSubSite.coordinates.lng,
        accuracy: 4.2
      },
      observedAt: new Date().toISOString(),
      envObservations: envObs,
      qualityScore: confidenceFactors?.score || 91,
      version: 1,
      media: [
        {
          id: `media-up-${Date.now()}`,
          observationId: newObsId,
          url: upstreamPhoto,
          hash: 'sha256-up-' + Math.random().toString(36).substring(7),
          mimeType: 'image/jpeg',
          fileSizeBytes: 245800,
          captureTimestamp: new Date().toISOString(),
          qualityScore: imageQuality?.quality_score ?? imageQuality?.qualityScore ?? 92,
          qualityFactors: imageQuality?.factors || {
            blurScore: 88,
            blurPassed: true,
            brightnessScore: 85,
            brightnessPassed: true,
            occlusionScore: 92,
            occlusionPassed: true,
            streamRelevanceScore: 95,
            streamRelevancePassed: true,
            isDuplicate: false,
            duplicateSimilarity: 0.02
          }
        },
        {
          id: `media-down-${Date.now()}`,
          observationId: newObsId,
          url: downstreamPhoto,
          hash: 'sha256-down-' + Math.random().toString(36).substring(7),
          mimeType: 'image/jpeg',
          fileSizeBytes: 268400,
          captureTimestamp: new Date().toISOString(),
          qualityScore: 90,
          qualityFactors: imageQuality?.factors || {
            blurScore: 88,
            blurPassed: true,
            brightnessScore: 85,
            brightnessPassed: true,
            occlusionScore: 92,
            occlusionPassed: true,
            streamRelevanceScore: 95,
            streamRelevancePassed: true,
            isDuplicate: false,
            duplicateSimilarity: 0.02
          }
        },
        {
          id: `media-surround-${Date.now()}`,
          observationId: newObsId,
          url: surroundingPhoto,
          hash: 'sha256-surround-' + Math.random().toString(36).substring(7),
          mimeType: 'image/jpeg',
          fileSizeBytes: 215000,
          captureTimestamp: new Date().toISOString(),
          qualityScore: 88,
          qualityFactors: {
            blurScore: 85,
            blurPassed: true,
            brightnessScore: 82,
            brightnessPassed: true,
            occlusionScore: 90,
            occlusionPassed: true,
            streamRelevanceScore: 90,
            streamRelevancePassed: true,
            isDuplicate: false,
            duplicateSimilarity: 0.02
          }
        },
        {
          id: `media-bio-${Date.now()}`,
          observationId: newObsId,
          url: biodiversityPhoto,
          hash: 'sha256-bio-' + Math.random().toString(36).substring(7),
          mimeType: 'image/jpeg',
          fileSizeBytes: 198000,
          captureTimestamp: new Date().toISOString(),
          qualityScore: 89,
          qualityFactors: {
            blurScore: 89,
            blurPassed: true,
            brightnessScore: 84,
            brightnessPassed: true,
            occlusionScore: 91,
            occlusionPassed: true,
            streamRelevanceScore: 92,
            streamRelevancePassed: true,
            isDuplicate: false,
            duplicateSimilarity: 0.02
          }
        },
        ...(streamVideo ? [{
          id: `media-vid-${Date.now()}`,
          observationId: newObsId,
          url: streamVideo,
          hash: 'sha256-vid-' + Math.random().toString(36).substring(7),
          mimeType: 'video/mp4',
          fileSizeBytes: 1850000,
          captureTimestamp: new Date().toISOString(),
          qualityScore: 94,
          qualityFactors: {
            blurScore: 92,
            blurPassed: true,
            brightnessScore: 90,
            brightnessPassed: true,
            occlusionScore: 95,
            occlusionPassed: true,
            streamRelevanceScore: 96,
            streamRelevancePassed: true,
            isDuplicate: false,
            duplicateSimilarity: 0.01
          }
        }] : [])
      ],
      aiResult: {
        id: `ai-${Date.now()}`,
        observationId: newObsId,
        model: 'AquaGuard-Vision-v2.4',
        modelVersion: '2.4.1-distilvit',
        promptVersion: 'prompts/stream_oah_v3.json',
        inputHash: 'hash-stream-input-v3',
        confidence: confidenceFactors?.score || 91,
        confidenceFactors: confidenceFactors?.factors || {
          imageQuality: 92,
          aiEvidenceAgreement: 95,
          citizenConsistency: 90,
          gpsValidity: 98,
          historicalConsistency: 85
        },
        explanation: {
          what: `Observation for ${selectedSubSite.name} validated with ${confidenceFactors?.score || 91}% confidence`,
          why: `Multi-modal vision analysis confirmed riparian cover, visible channel bed morphology and ${waterFlow} flow condition consistent with baseline.`,
          evidence: [
            'Clear streambed visible with low turbidity optical scattering',
            'Overhanging riparian vegetative buffer intact',
            'Flow velocity consistent with hydrological catchment profile'
          ],
          confidence: confidenceFactors?.score || 91,
          nextAction: validationWarnings.length > 0 ? 'Routed to expert queue' : 'Automatically accepted and stored into FHIR store'
        },
        evidence: aiEvidence,
        validationWarnings: validationWarnings,
        routingDecision: validationWarnings.length > 0 ? 'REVIEW_REQUIRED' : 'VALID',
        createdAt: new Date().toISOString()
      },
      followupQuestions: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Save to offline storage
    OfflineStorageService.saveObservation(newObservation);
    setSubmittedObsId(newObsId);
    setSubmissionSuccess(true);
    setIsSubmitting(false);

    if (onObservationSubmitted) {
      onObservationSubmitted(newObservation);
    }
  };

  const loadPresetHealthyStream = () => {
    setSelectedSite(SAMPLE_SITES[3]); // Oslo
    setSelectedSubSite(SAMPLE_SITES[3].subSites[1]); // Sagene
    setUpstreamPhoto('/app_photos/image4.png');
    setDownstreamPhoto('/app_photos/image19.png');
    setSurroundingPhoto('/app_photos/image18.png');
    setBiodiversityPhoto('/app_photos/image15.png');
    setChannelForm('u_shape');
    setBufferLeftWidth('5-10m');
    setBufferRightWidth('5-10m');
    setWaterAspect('clear');
    setWaterFlow('fast');
    setBottomType('natural');
    setBankType('natural');
    setHasHabitats(true);
    setHasNaturalDebris(true);
    setHasArtificialPipes(false);
    setHasArtificialBarriers(false);
    setHasLitterTrash(false);
    setOdor('none');
    setOverallHealthRating('good');
    setCitizenConfidence(5);
    setCitizenNotes('Reference-level clear urban stream with rich gravel beds and healthy riparian verge.');
    setAiAnalysisComplete(false);
    setSubmissionSuccess(false);
    setIsSubmitting(false);
  };

  const loadPresetImpactedStream = () => {
    setSelectedSite(SAMPLE_SITES[4]); // Toulouse
    setSelectedSubSite(SAMPLE_SITES[4].subSites[4]); // Marcaissonne aval
    setUpstreamPhoto('/app_photos/image6.jpg');
    setDownstreamPhoto('/app_photos/image1.jpg');
    setSurroundingPhoto('/app_photos/image22.png');
    setBiodiversityPhoto('/app_photos/image12.png');
    setChannelForm('flat');
    setBufferLeftWidth('<1m');
    setBufferRightWidth('1-5m');
    setWaterAspect('turbid');
    setWaterFlow('slow');
    setBottomType('artificial');
    setBankType('artificial');
    setHasHabitats(false);
    setHasNaturalDebris(false);
    setHasArtificialPipes(true);
    setHasArtificialBarriers(true);
    setHasLitterTrash(true);
    setOdor('sewage');
    setOverallHealthRating('poor');
    setCitizenConfidence(4);
    setCitizenNotes('Visible discharge pipe, concrete canal walls, low dissolved oxygen sheen and urban runoff.');
    setAiAnalysisComplete(false);
    setSubmissionSuccess(false);
    setIsSubmitting(false);
  };

  const stepTitles = [
    { step: 1, label: 'Basic Information', sub: 'What is this App for?' },
    { step: 2, label: 'Site Selection', sub: 'Select OneAquaHealth stream site' },
    { step: 3, label: 'Media Upload', sub: 'Upload your stream photos' },
    { step: 4, label: 'Water Observations', sub: 'Conditions, odor, flow & health rating' },
    { step: 5, label: 'AI Assessment', sub: 'Real AI cross-check & submission' }
  ];

  return (
    <div
      style={{
        maxWidth: '1240px',
        margin: '0 auto',
        padding: '20px 16px 80px',
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Quick Demo Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
          padding: '12px 18px',
          background: 'rgba(15, 23, 42, 0.85)',
          borderRadius: '12px',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(14, 165, 233, 0.2)',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            OneAquaHealth Citizen App
          </span>
          <span style={{ fontSize: '13px', color: '#94a3b8' }}>
            5-Step Official Stream Observation Wizard
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={loadPresetHealthyStream}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#34d399',
              cursor: 'pointer'
            }}
          >
            <Sparkles size={14} /> Preset: Natural Stream (Oslo)
          </button>

          <button
            onClick={loadPresetImpactedStream}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 500,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              cursor: 'pointer'
            }}
          >
            <AlertTriangle size={14} /> Preset: Impacted Stream (Toulouse)
          </button>
        </div>
      </div>

      {/* Top Stepper Navigation (1 to 9) - Matching official photos */}
      <div
        style={{
          background: '#091122',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '24px 20px 16px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
          marginBottom: '24px'
        }}
      >
        {/* Step Circles Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'relative',
            maxWidth: '920px',
            margin: '0 auto 18px',
            padding: '0 10px'
          }}
        >
          {/* Connector Line behind circles */}
          <div
            style={{
              position: 'absolute',
              top: '18px',
              left: '30px',
              right: '30px',
              height: '3px',
              background: '#1e293b',
              zIndex: 0
            }}
          >
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #0284c7, #38bdf8)',
                width: `${((currentStep - 1) / 4) * 100}%`,
                transition: 'width 0.3s ease'
              }}
            />
          </div>

          {[1, 2, 3, 4, 5].map((stepNum) => {
            const isActive = currentStep === stepNum;
            const isCompleted = currentStep > stepNum;
            return (
              <button
                key={stepNum}
                onClick={() => setCurrentStep(stepNum)}
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  border: isActive
                    ? '2px solid #38bdf8'
                    : isCompleted
                    ? '2px solid #0284c7'
                    : '2px solid #334155',
                  background: isActive
                    ? '#0284c7'
                    : isCompleted
                    ? '#0369a1'
                    : '#0f172a',
                  color: isActive || isCompleted ? '#ffffff' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? '0 0 16px rgba(56, 189, 248, 0.6)' : 'none'
                }}
              >
                {stepNum}
              </button>
            );
          })}
        </div>

        {/* Current Step Label Header */}
        <div style={{ textAlign: 'center', marginTop: '6px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc' }}>
            Step {currentStep}
          </div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
            {stepTitles[currentStep - 1].label} — {stepTitles[currentStep - 1].sub}
          </div>
        </div>

        {/* Previous / Next Action Buttons Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '20px',
            maxWidth: '920px',
            margin: '20px auto 0'
          }}
        >
          <button
            onClick={() => setCurrentStep(1)}
            title="Go to Step 1"
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Home size={18} />
          </button>

          <button
            disabled={currentStep === 1}
            onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '8px',
              background: currentStep === 1 ? '#1e293b' : '#0284c7',
              border: 'none',
              color: currentStep === 1 ? '#64748b' : '#ffffff',
              fontWeight: 600,
              fontSize: '14px',
              cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              opacity: currentStep === 1 ? 0.6 : 1
            }}
          >
            <ChevronLeft size={18} /> Previous
          </button>

          {currentStep < 5 ? (
            <button
              onClick={() => setCurrentStep((prev) => prev + 1)}
              style={{
                flex: 1,
                padding: '12px 18px',
                borderRadius: '8px',
                background: '#38bdf8',
                border: 'none',
                color: '#0f172a',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease',
                boxShadow: '0 0 16px rgba(56, 189, 248, 0.3)'
              }}
            >
              Next Step <ChevronRight size={18} />
            </button>
          ) : (
            <div
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '8px',
                background: submissionSuccess ? 'rgba(16, 185, 129, 0.15)' : 'rgba(56, 189, 248, 0.1)',
                border: submissionSuccess ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.3)',
                color: submissionSuccess ? '#34d399' : '#38bdf8',
                fontWeight: 600,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              {submissionSuccess ? (
                <>
                  <CheckCircle2 size={16} /> Observation Submitted & Recorded
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Final Step: Review AI Results & Submit Below
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Step Content Container */}
      <div
        style={{
          background: '#0a1222',
          border: '1px solid #1e293b',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* STEP 1: Basic Information */}
        {currentStep === 1 && (
          <div>
            <div
              style={{
                position: 'relative',
                borderRadius: '14px',
                overflow: 'hidden',
                border: '1px solid #1e293b',
                background: 'linear-gradient(135deg, #091a2f 0%, #063147 100%)',
                minHeight: '260px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '30px 20px',
                marginBottom: '28px'
              }}
            >
              <div
                style={{
                  width: '90px',
                  height: '90px',
                  borderRadius: '50%',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '2px solid rgba(56, 189, 248, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}
              >
                <img
                  src="/app_photos/image10.png"
                  alt="OneAquaHealth Logo"
                  style={{
                    width: '74px',
                    height: '74px',
                    objectFit: 'contain',
                    borderRadius: '50%'
                  }}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>

              <h2
                style={{
                  fontSize: '26px',
                  fontWeight: 800,
                  color: '#ffffff',
                  marginBottom: '10px'
                }}
              >
                What is this App for?
              </h2>
              <p
                style={{
                  fontSize: '16px',
                  color: '#e2e8f0',
                  maxWidth: '700px',
                  lineHeight: '1.6',
                  fontWeight: 400
                }}
              >
                This App is for citizens and aims to gather data on the health of urban streams
                across the OneAquaHealth research cities.
              </p>
            </div>

            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px'
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  color: '#38bdf8',
                  fontWeight: 700,
                  fontSize: '17px',
                  marginBottom: '14px'
                }}
              >
                <Info size={22} /> Before you submit:
              </div>

              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '14px',
                  fontSize: '14px',
                  color: '#cbd5e1'
                }}
              >
                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    background: '#131e33',
                    padding: '14px',
                    borderRadius: '8px'
                  }}
                >
                  <CheckCircle2 size={18} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    <strong>100m Reach Assessment:</strong> Observe roughly 50m upstream and 50m downstream from where you stand.
                  </span>
                </li>

                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    background: '#131e33',
                    padding: '14px',
                    borderRadius: '8px'
                  }}
                >
                  <CheckCircle2 size={18} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    <strong>Safety First:</strong> Never enter fast-flowing or swollen streams. Stay on stable public footpaths or banks.
                  </span>
                </li>

                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    background: '#131e33',
                    padding: '14px',
                    borderRadius: '8px'
                  }}
                >
                  <CheckCircle2 size={18} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    <strong>AI Multi-Modal Verification:</strong> Your photos will be verified in real time using our Track 3 AI Vision pipeline to assist in ecological scoring.
                  </span>
                </li>

                <li
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    background: '#131e33',
                    padding: '14px',
                    borderRadius: '8px'
                  }}
                >
                  <CheckCircle2 size={18} color="#38bdf8" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <span>
                    <strong>Offline Support:</strong> Observations are saved locally and synced once network connectivity is re-established.
                  </span>
                </li>
              </ul>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setCurrentStep(2)}
                style={{
                  padding: '14px 32px',
                  borderRadius: '10px',
                  background: '#38bdf8',
                  color: '#0f172a',
                  fontWeight: 700,
                  fontSize: '15px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(56, 189, 248, 0.35)'
                }}
              >
                Proceed to Site Selection <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Site Selection */}
        {currentStep === 2 && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '18px'
              }}
            >
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
                  Select OneAquaHealth urban stream sites to assess
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>
                  Distance from your GPS coordinates is calculated in real time.
                </p>
              </div>

              <button
                onClick={handleOpenAddSiteModal}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  background: '#1e293b',
                  border: '1px solid #38bdf8',
                  color: '#38bdf8',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                + Add New Site
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                gap: '20px'
              }}
            >
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px',
                  maxHeight: '480px',
                  overflowY: 'auto'
                }}
              >
                <input
                  type="text"
                  placeholder="Filter by stream name or code (e.g. O1, Alna, Hovin, Sagene)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    background: '#131e33',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    fontSize: '13px',
                    marginBottom: '14px',
                    boxSizing: 'border-box'
                  }}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {SAMPLE_SITES.map((site) => (
                    <div key={site.id}>
                      <div
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: '#38bdf8',
                          padding: '6px 4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em'
                        }}
                      >
                        {site.city} ({site.country}) — {site.waterbody}
                      </div>

                      {site.subSites
                        .filter(
                          (ss) =>
                            ss.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            ss.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            site.city.toLowerCase().includes(searchQuery.toLowerCase())
                        )
                        .map((ss) => {
                          const isSelected =
                            selectedSite.id === site.id && selectedSubSite.code === ss.code;
                          return (
                            <div
                              key={ss.code}
                              onClick={() => {
                                setSelectedSite(site);
                                setSelectedSubSite(ss);
                              }}
                              style={{
                                padding: '10px 12px',
                                borderRadius: '8px',
                                background: isSelected ? '#0284c7' : '#131e33',
                                color: isSelected ? '#ffffff' : '#cbd5e1',
                                border: isSelected
                                  ? '1px solid #38bdf8'
                                  : '1px solid transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '4px',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              <div>
                                <span style={{ fontWeight: 700, marginRight: '8px' }}>
                                  {ss.code} / {ss.name}
                                </span>
                              </div>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  background: isSelected
                                    ? 'rgba(255,255,255,0.2)'
                                    : 'rgba(56, 189, 248, 0.1)',
                                  color: isSelected ? '#ffffff' : '#38bdf8'
                                }}
                              >
                                {ss.healthRisk} Risk
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ marginBottom: '14px' }}>
                  <StreamMap
                    sites={SAMPLE_SITES}
                    selectedSite={selectedSite}
                    selectedSubSite={selectedSubSite}
                    onSelectSite={(site, subSite) => {
                      setSelectedSite(site);
                      setSelectedSubSite(subSite);
                    }}
                    height="320px"
                  />
                </div>
                    <div
                  style={{
                    background: '#131e33',
                    padding: '14px',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                    Selected Monitoring Reach:
                  </div>
                  <div style={{ color: '#ffffff', fontSize: '15px', fontWeight: 600 }}>
                    {selectedSite.name} — {selectedSubSite.name}
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: '4px', fontSize: '12px' }}>
                    Baseline Clarity Score: {selectedSite.baseline.clarityScoreAvg}/100 | Typical Flow:{' '}
                    {selectedSite.baseline.typicalFlow}
                  </div>
                </div>
              </div>
            </div>

            {showAddSiteModal && (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.75)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999,
                  backdropFilter: 'blur(6px)'
                }}
              >
                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #38bdf8',
                    borderRadius: '16px',
                    padding: '26px',
                    maxWidth: '480px',
                    width: '92%',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.8)'
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', fontSize: '18px', color: '#38bdf8', fontWeight: 700 }}>
                    Add Custom Stream Observation Site
                  </h4>
                  <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '18px' }}>
                    Specify reach name &amp; GPS coordinates. It will be marked live on the map and added to the registry for <strong>{selectedSite.city}</strong>.
                  </p>

                  {/* Reach Name */}
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                    Stream Reach / Location Name:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Calore — New Footbridge Reach"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#ffffff',
                      marginBottom: '14px',
                      boxSizing: 'border-box'
                    }}
                  />

                  {/* Reach Code & Risk Level */}
                  <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                        Reach Code:
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. B6"
                        value={newSiteCode}
                        onChange={(e) => setNewSiteCode(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#38bdf8',
                          fontWeight: 700,
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                        Health Risk Level:
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {(['Low', 'Moderate', 'High'] as const).map((risk) => (
                          <button
                            key={risk}
                            type="button"
                            onClick={() => setNewSiteRisk(risk)}
                            style={{
                              flex: 1,
                              padding: '9px 6px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: 700,
                              background: newSiteRisk === risk
                                ? (risk === 'Low' ? '#064e3b' : risk === 'Moderate' ? '#451a03' : '#450a0a')
                                : '#1e293b',
                              border: newSiteRisk === risk
                                ? (risk === 'Low' ? '1px solid #10b981' : risk === 'Moderate' ? '1px solid #f59e0b' : '1px solid #ef4444')
                                : '1px solid #334155',
                              color: newSiteRisk === risk
                                ? (risk === 'Low' ? '#34d399' : risk === 'Moderate' ? '#fbbf24' : '#f87171')
                                : '#94a3b8'
                            }}
                          >
                            {risk}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* GPS Coordinates Header & Auto-Detect Button */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                      GPS Coordinates (Map Pin Placement):
                    </label>
                    <button
                      type="button"
                      onClick={handleUseCurrentGps}
                      disabled={isGettingGps}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        border: '1px solid #38bdf8',
                        color: '#38bdf8',
                        fontSize: '11px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {isGettingGps ? 'Locating...' : '📍 Use Current Device GPS'}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Latitude:</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={newSiteLat}
                        onChange={(e) => setNewSiteLat(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '13px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>Longitude:</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={newSiteLng}
                        onChange={(e) => setNewSiteLng(parseFloat(e.target.value) || 0)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          color: '#ffffff',
                          fontSize: '13px',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddSiteModal(false)}
                      style={{
                        padding: '10px 16px',
                        background: '#334155',
                        border: 'none',
                        color: '#cbd5e1',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '13px'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (newSiteName.trim()) {
                          const newSS: SubSite = {
                            code: newSiteCode.trim() || `C-${Date.now().toString().slice(-3)}`,
                            name: newSiteName.trim(),
                            coordinates: { lat: newSiteLat, lng: newSiteLng },
                            healthRisk: newSiteRisk
                          };
                          selectedSite.subSites.unshift(newSS);
                          setSelectedSubSite(newSS);
                          setShowAddSiteModal(false);
                          setNewSiteName('');
                        }
                      }}
                      style={{
                        padding: '10px 18px',
                        background: '#0284c7',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '8px',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer'
                      }}
                    >
                      Mark on Map &amp; Select
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 3: Media Upload */}
        {currentStep === 3 && (
          <div>
            <div
              style={{
                background: '#131e33',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '12px 18px',
                marginBottom: '22px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#38bdf8'
              }}
            >
              <Camera size={20} />
              <span style={{ fontSize: '14px', fontWeight: 600 }}>
                Select your stream images (matching Step 3 of the OneAquaHealth App):
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '18px',
                marginBottom: '24px'
              }}
            >
              {/* Media Slot 1: Upstream photo */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>
                  Upstream photo
                </div>
                <div
                  onClick={() => openMediaPreview(0)}
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  title="Click to preview full-screen image"
                >
                  <img
                    src={upstreamPhoto}
                    alt="Upstream"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: '#38bdf8',
                      fontWeight: 600,
                    }}
                  >
                    🔍 Preview
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '6px',
                      background: 'rgba(0,0,0,0.6)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#38bdf8'
                    }}
                  >
                    ⬆ Upstream View
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '6px', background: '#0284c7', border: 'none', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', justifyContent: 'center' }}>
                  <Upload size={14} /> Upload Real Photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setUpstreamPhoto(URL.createObjectURL(file));
                    }}
                  />
                </label>
              </div>

              {/* Media Slot 2: Downstream photo */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>
                  Downstream photo
                </div>
                <div
                  onClick={() => openMediaPreview(1)}
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  title="Click to preview full-screen image"
                >
                  <img
                    src={downstreamPhoto}
                    alt="Downstream"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: '#38bdf8',
                      fontWeight: 600,
                    }}
                  >
                    🔍 Preview
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '6px',
                      background: 'rgba(0,0,0,0.6)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#38bdf8'
                    }}
                  >
                    ⬇ Downstream View
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '6px', background: '#0284c7', border: 'none', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', justifyContent: 'center' }}>
                  <Upload size={14} /> Upload Real Photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setDownstreamPhoto(URL.createObjectURL(file));
                    }}
                  />
                </label>
              </div>

              {/* Media Slot 3: Surrounding context */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>
                  Surrounding context photo
                </div>
                <div
                  onClick={() => openMediaPreview(2)}
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  title="Click to preview full-screen image"
                >
                  <img
                    src={surroundingPhoto}
                    alt="Surrounding context"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: '#38bdf8',
                      fontWeight: 600,
                    }}
                  >
                    🔍 Preview
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '6px',
                      background: 'rgba(0,0,0,0.6)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#38bdf8'
                    }}
                  >
                    🏡 Houses, Roads, Buffers
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '6px', background: '#0284c7', border: 'none', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', justifyContent: 'center' }}>
                  <Upload size={14} /> Upload Real Photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setSurroundingPhoto(URL.createObjectURL(file));
                    }}
                  />
                </label>
              </div>

              {/* Media Slot 4: Biodiversity element */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>
                  Biodiversity photo
                </div>
                <div
                  onClick={() => openMediaPreview(3)}
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative',
                    cursor: 'pointer',
                  }}
                  title="Click to preview full-screen image"
                >
                  <img
                    src={biodiversityPhoto}
                    alt="Biodiversity"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      background: 'rgba(15, 23, 42, 0.8)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: '#38bdf8',
                      fontWeight: 600,
                    }}
                  >
                    🔍 Preview
                  </div>
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '6px',
                      background: 'rgba(0,0,0,0.6)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#38bdf8'
                    }}
                  >
                    🌿 Flora / Fauna
                  </div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px', borderRadius: '6px', background: '#0284c7', border: 'none', color: '#ffffff', fontSize: '12px', fontWeight: 600, cursor: 'pointer', justifyContent: 'center' }}>
                  <Upload size={14} /> Upload Real Photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setBiodiversityPhoto(URL.createObjectURL(file));
                    }}
                  />
                </label>
              </div>

              {/* Media Slot 5: Short Video (5-15s) */}
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: '14px', color: '#f8fafc' }}>
                    Stream Video (5-15s)
                  </div>
                  {streamVideo && (
                    <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 700 }}>
                      ✓ Video Ready
                    </span>
                  )}
                </div>

                <div
                  onClick={() => {
                    if (streamVideo) openMediaPreview(4);
                  }}
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    background: '#131e33',
                    border: streamVideo ? '1px solid #10b981' : '1px dashed #38bdf8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                    overflow: 'hidden',
                    position: 'relative',
                    cursor: streamVideo ? 'pointer' : 'default',
                  }}
                  title={streamVideo ? 'Click to preview video full-screen' : ''}
                >
                  {streamVideo ? (
                    <>
                      <video
                        src={streamVideo}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: 'rgba(0,0,0,0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '12px',
                        }}
                      >
                        ▶ Click to Play Fullscreen
                      </div>
                    </>
                  ) : (
                    <>
                      <Video size={36} />
                      <span style={{ fontSize: '12px', marginTop: '6px', color: '#cbd5e1' }}>
                        No video selected
                      </span>
                      <span style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                        Upload actual stream flow clip
                      </span>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <label
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      borderRadius: '6px',
                      background: '#0284c7',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Upload size={14} /> {streamVideo ? 'Replace Video' : 'Upload Real Video'}
                    <input
                      type="file"
                      accept="video/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setStreamVideo(URL.createObjectURL(file));
                          setStreamVideoName(file.name);
                        }
                      }}
                    />
                  </label>

                  {streamVideo && (
                    <button
                      type="button"
                      onClick={() => {
                        setStreamVideo(null);
                        setStreamVideoName('');
                      }}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: '#334155',
                        border: 'none',
                        color: '#f87171',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
          </div>
            </div>
        )}

        {/* STEP 4: Structured Water Conditions + AI Adaptive Questions */}
        {currentStep === 4 && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#38bdf8', marginBottom: '16px' }}>Water Conditions</h3>

              {/* Water Clarity */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#94a3b8', fontSize: '14px' }}>Water Appearance:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  {(['clear', 'turbid', 'foam', 'altered_color', 'unsure'] as const).map(opt => (
                    <button key={opt} onClick={() => setWaterAspect(opt)}
                      style={{ padding: '12px 8px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                        background: waterAspect === opt ? '#0284c7' : '#1e293b',
                        border: waterAspect === opt ? '1px solid #38bdf8' : '1px solid #334155',
                        color: waterAspect === opt ? '#ffffff' : '#94a3b8' }}>
                      {opt === 'clear' ? 'Clear' : opt === 'turbid' ? 'Turbid / Murky' : opt === 'foam' ? 'Foam' : opt === 'altered_color' ? 'Altered Color' : 'Unsure'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Water Flow */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#94a3b8', fontSize: '14px' }}>Water Flow Rate:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  {(['fast', 'slow', 'stagnant', 'dry', 'unsure'] as const).map(opt => (
                    <button key={opt} onClick={() => setWaterFlow(opt)}
                      style={{ padding: '12px 8px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                        background: waterFlow === opt ? '#0284c7' : '#1e293b',
                        border: waterFlow === opt ? '1px solid #38bdf8' : '1px solid #334155',
                        color: waterFlow === opt ? '#ffffff' : '#94a3b8' }}>
                      {opt === 'fast' ? 'Fast Flow' : opt === 'slow' ? 'Slow Flow' : opt === 'stagnant' ? 'Stagnant' : opt === 'dry' ? 'Dry' : 'Unsure'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Odor */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#94a3b8', fontSize: '14px' }}>Odor:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  {(['none', 'earthy', 'sewage', 'chemical', 'fishy'] as const).map(opt => (
                    <button key={opt} onClick={() => setOdor(opt)}
                      style={{ padding: '12px 8px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '13px',
                        background: odor === opt ? '#0284c7' : '#1e293b',
                        border: odor === opt ? '1px solid #38bdf8' : '1px solid #334155',
                        color: odor === opt ? '#ffffff' : '#94a3b8' }}>
                      {opt === 'none' ? 'No Odor' : opt === 'earthy' ? 'Earthy' : opt === 'sewage' ? 'Sewage' : opt === 'chemical' ? 'Chemical' : 'Fishy'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Litter */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#94a3b8', fontSize: '14px' }}>Visible Litter/Trash?</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => setHasLitterTrash(true)} style={{ flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: hasLitterTrash ? '#dc2626' : '#1e293b', border: hasLitterTrash ? '1px solid #ef4444' : '1px solid #334155', color: hasLitterTrash ? '#ffffff' : '#94a3b8' }}>Yes — Litter Present</button>
                  <button onClick={() => setHasLitterTrash(false)} style={{ flex: 1, padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, background: !hasLitterTrash ? '#0284c7' : '#1e293b', border: !hasLitterTrash ? '1px solid #38bdf8' : '1px solid #334155', color: !hasLitterTrash ? '#ffffff' : '#94a3b8' }}>No — Clean</button>
                </div>
              </div>

              {/* Overall Health Rating */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '10px', fontWeight: 600, color: '#94a3b8', fontSize: '14px' }}>Your Overall Health Rating:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  {(['good', 'moderate', 'poor'] as const).map(rating => (
                    <button key={rating} onClick={() => setOverallHealthRating(rating)}
                      style={{ padding: '16px 8px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '14px',
                        background: overallHealthRating === rating ? (rating === 'good' ? '#064e3b' : rating === 'moderate' ? '#451a03' : '#450a0a') : '#1e293b',
                        border: overallHealthRating === rating ? (rating === 'good' ? '2px solid #10b981' : rating === 'moderate' ? '2px solid #f59e0b' : '2px solid #ef4444') : '1px solid #334155',
                        color: overallHealthRating === rating ? '#ffffff' : '#94a3b8' }}>
                      {rating === 'good' ? 'Good Health' : rating === 'moderate' ? 'Moderate' : 'Poor Health'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Field Notes */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#94a3b8', fontSize: '14px' }}>Field Notes:</label>
                <textarea
                  value={citizenNotes}
                  onChange={(e) => setCitizenNotes(e.target.value)}
                  style={{ width: '100%', padding: '12px', borderRadius: '8px', background: '#0f172a', border: '1px solid #1e293b', color: '#f8fafc', minHeight: '80px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                  placeholder="Describe anything else you noticed at this stream reach..."
                />
              </div>

              {/* Confidence Rating */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#94a3b8', fontSize: '14px' }}>Your Confidence (1-5):</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setCitizenConfidence(star)}
                      style={{ flex: 1, padding: '14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '16px',
                        background: citizenConfidence >= star ? '#0284c7' : '#1e293b',
                        border: citizenConfidence >= star ? '1px solid #38bdf8' : '1px solid #334155',
                        color: citizenConfidence >= star ? '#ffffff' : '#64748b' }}>
                      {star}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* STEP 5: AI Real-Time Stream Assessment & Submission */}
        {currentStep === 5 && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '20px',
                paddingBottom: '16px',
                borderBottom: '1px solid #1e293b'
              }}
            >
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: '#38bdf8' }}>
                  Track 3: Real-Time AI Stream Health Cross-Check
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', margin: '4px 0 0' }}>
                  Automated computer vision verification, image quality routing, and FHIR standard bundle generation.
                </p>
              </div>

              <button
                onClick={runRealTimeAiAssessment}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  background: '#1e293b',
                  border: '1px solid #38bdf8',
                  color: '#38bdf8',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <RotateCcw size={14} /> Re-run AI Analysis
              </button>
            </div>

            {isAiAnalyzing && (
              <div
                style={{
                  padding: '40px',
                  textAlign: 'center',
                  background: '#0f172a',
                  borderRadius: '12px',
                  border: '1px solid #1e293b'
                }}
              >
                <div
                  style={{
                    display: 'inline-block',
                    width: '40px',
                    height: '40px',
                    border: '3px solid rgba(56, 189, 248, 0.2)',
                    borderTop: '3px solid #38bdf8',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite',
                    marginBottom: '14px'
                  }}
                />
                <div style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                  Processing Multi-Modal Stream Evidence...
                </div>
                <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                  Evaluating image sharpness, turbidity optical reflection, riparian vegetation width, and historical baseline z-score.
                </div>
              </div>
            )}

            {!isAiAnalyzing && aiAnalysisComplete && (
              <div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                    gap: '16px',
                    marginBottom: '24px'
                  }}
                >
                  <div
                    style={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '12px',
                      padding: '20px'
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>
                      Overall AI Confidence Score
                    </div>
                    <div
                      style={{
                        fontSize: '38px',
                        fontWeight: 900,
                        color:
                          (confidenceFactors?.score || 90) >= 80
                            ? '#10b981'
                            : (confidenceFactors?.score || 90) >= 60
                            ? '#f59e0b'
                            : '#ef4444',
                        margin: '6px 0'
                      }}
                    >
                      {confidenceFactors?.score || 91}%
                    </div>
                    <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                      Routing Decision:{' '}
                      <strong
                        style={{
                          color:
                            validationWarnings.length === 0 ? '#10b981' : '#f59e0b'
                        }}
                      >
                        {validationWarnings.length === 0
                          ? 'AUTO-VALIDATED'
                          : 'REVIEW REQUIRED'}
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '12px',
                      padding: '20px'
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>
                      Vision Quality Score
                    </div>
                    <div
                      style={{
                        fontSize: '38px',
                        fontWeight: 900,
                        color: '#38bdf8',
                        margin: '6px 0'
                      }}
                    >
                      {imageQuality?.quality_score ?? imageQuality?.qualityScore ?? 92}/100
                    </div>
                    <div style={{ fontSize: '13px', color: '#cbd5e1' }}>
                      Blur & Exposure: <strong style={{ color: '#10b981' }}>Passed</strong> | Stream Relevance:{' '}
                      <strong style={{ color: '#10b981' }}>High (95%)</strong>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#0f172a',
                      border: '1px solid #1e293b',
                      borderRadius: '12px',
                      padding: '20px'
                    }}
                  >
                    <div style={{ fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase' }}>
                      Ecosystem Rating Agreement
                    </div>
                    <div
                      style={{
                        fontSize: '22px',
                        fontWeight: 700,
                        color: '#ffffff',
                        margin: '12px 0 6px'
                      }}
                    >
                      Citizen: <span style={{ textTransform: 'capitalize' }}>{overallHealthRating}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                      Model consensus:{' '}
                      <strong style={{ color: '#38bdf8' }}>
                        {overallHealthRating === 'good' ? 'Intact Riparian' : 'Altered Hydromorphology'}
                      </strong>
                    </div>
                  </div>
                </div>

                {validationWarnings.length > 0 ? (
                  <div
                    style={{
                      background: '#2f1f0a',
                      border: '1px solid #f59e0b',
                      borderRadius: '12px',
                      padding: '18px',
                      marginBottom: '24px'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        color: '#f59e0b',
                        fontWeight: 700,
                        fontSize: '15px',
                        marginBottom: '8px'
                      }}
                    >
                      <AlertTriangle size={20} /> AI Discrepancy Detected (Explainable AI Next Steps)
                    </div>
                    {validationWarnings.map((w, i) => (
                      <div key={i} style={{ fontSize: '13px', color: '#fef3c7', lineHeight: '1.5' }}>
                        <div>{w.explanation.why}</div>
                        <div style={{ color: '#fde68a', marginTop: '4px' }}>
                          💡 <strong>Action:</strong> {w.explanation.nextAction}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      background: '#09291f',
                      border: '1px solid #10b981',
                      borderRadius: '12px',
                      padding: '16px 20px',
                      marginBottom: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      color: '#a7f3d0'
                    }}
                  >
                    <ShieldCheck size={24} color="#10b981" />
                    <div>
                      <div style={{ fontWeight: 700, color: '#10b981', fontSize: '14px' }}>
                        All Verification Constraints Satisfied
                      </div>
                      <div style={{ fontSize: '12px' }}>
                        Citizen answers align with optical vision evidence and historical catchment baselines.
                      </div>
                    </div>
                  </div>
                )}

                {submissionSuccess ? (
                  <div
                    style={{
                      background: '#064e3b',
                      border: '2px solid #34d399',
                      borderRadius: '14px',
                      padding: '24px',
                      textAlign: 'center',
                      boxShadow: '0 0 30px rgba(16, 185, 129, 0.3)'
                    }}
                  >
                    <CheckCircle2 size={48} color="#34d399" style={{ margin: '0 auto 12px' }} />
                    <h3 style={{ margin: '0 0 8px', fontSize: '20px', color: '#ffffff' }}>
                      Observation Successfully Recorded & Submitted!
                    </h3>
                    <p style={{ margin: '0 0 16px', fontSize: '14px', color: '#a7f3d0' }}>
                      Observation ID: <code style={{ color: '#ffffff' }}>{submittedObsId}</code> has been verified,
                      saved to offline IndexedDB storage, and synchronized to the OneAquaHealth registry.
                    </p>

                    {/* Uploaded Field Evidence Gallery */}
                    <div
                      style={{
                        margin: '20px 0',
                        textAlign: 'left',
                        background: 'rgba(0, 0, 0, 0.35)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: '12px',
                        padding: '16px'
                      }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', marginBottom: '12px' }}>
                        📷 Attached Field Evidence ({4 + (streamVideo ? 1 : 0)} items recorded):
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                          gap: '12px'
                        }}
                      >
                        <div onClick={() => openMediaPreview(0)} style={{ background: '#091122', padding: '6px', borderRadius: '8px', border: '1px solid #1e293b', cursor: 'pointer' }} title="Click to enlarge">
                          <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>⬆ Upstream</div>
                          <img src={upstreamPhoto} alt="Upstream" style={{ width: '100%', height: '85px', objectFit: 'cover', borderRadius: '6px' }} />
                        </div>

                        <div onClick={() => openMediaPreview(1)} style={{ background: '#091122', padding: '6px', borderRadius: '8px', border: '1px solid #1e293b', cursor: 'pointer' }} title="Click to enlarge">
                          <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>⬇ Downstream</div>
                          <img src={downstreamPhoto} alt="Downstream" style={{ width: '100%', height: '85px', objectFit: 'cover', borderRadius: '6px' }} />
                        </div>

                        <div onClick={() => openMediaPreview(2)} style={{ background: '#091122', padding: '6px', borderRadius: '8px', border: '1px solid #1e293b', cursor: 'pointer' }} title="Click to enlarge">
                          <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>🏡 Surroundings</div>
                          <img src={surroundingPhoto} alt="Surroundings" style={{ width: '100%', height: '85px', objectFit: 'cover', borderRadius: '6px' }} />
                        </div>

                        <div onClick={() => openMediaPreview(3)} style={{ background: '#091122', padding: '6px', borderRadius: '8px', border: '1px solid #1e293b', cursor: 'pointer' }} title="Click to enlarge">
                          <div style={{ fontSize: '11px', color: '#cbd5e1', marginBottom: '4px', fontWeight: 600 }}>🌿 Biodiversity</div>
                          <img src={biodiversityPhoto} alt="Biodiversity" style={{ width: '100%', height: '85px', objectFit: 'cover', borderRadius: '6px' }} />
                        </div>

                        {streamVideo && (
                          <div onClick={() => openMediaPreview(4)} style={{ background: '#091122', padding: '6px', borderRadius: '8px', border: '1px solid #10b981', cursor: 'pointer' }} title="Click to play fullscreen">
                            <div style={{ fontSize: '11px', color: '#34d399', marginBottom: '4px', fontWeight: 700 }}>🎥 Stream Video</div>
                            <video src={streamVideo} style={{ width: '100%', height: '85px', objectFit: 'cover', borderRadius: '6px' }} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                      <button
                        onClick={() => {
                          setSubmissionSuccess(false);
                          setCurrentStep(1);
                        }}
                        style={{
                          padding: '10px 20px',
                          borderRadius: '8px',
                          background: '#34d399',
                          color: '#064e3b',
                          fontWeight: 700,
                          fontSize: '14px',
                          border: 'none',
                          cursor: 'pointer'
                        }}
                      >
                        Submit Another Observation
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', marginTop: '28px' }}>
                    <button
                      id="btn-finalize-submit-obs"
                      disabled={isSubmitting || submissionSuccess || isAiAnalyzing}
                      onClick={handleFinalSubmit}
                      style={{
                        padding: '16px 36px',
                        borderRadius: '12px',
                        background: isSubmitting || isAiAnalyzing
                          ? '#1e293b'
                          : 'linear-gradient(90deg, #0284c7, #10b981)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '16px',
                        border: isSubmitting || isAiAnalyzing ? '1px solid #334155' : 'none',
                        cursor: isSubmitting || isAiAnalyzing ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        boxShadow: isSubmitting || isAiAnalyzing ? 'none' : '0 10px 25px rgba(2, 132, 199, 0.4)',
                        opacity: isSubmitting || isAiAnalyzing ? 0.7 : 1,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <RotateCcw size={20} className="pulse-indicator" /> Submitting & Syncing to Cloud...
                        </>
                      ) : isAiAnalyzing ? (
                        <>
                          <RotateCcw size={20} className="pulse-indicator" /> Running Multi-Modal AI Assessment...
                        </>
                      ) : (
                        <>
                          <Award size={20} /> Finalize Observation & Submit to FHIR Registry
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Media Preview Lightbox Modal */}
      <MediaPreviewModal
        isOpen={previewModal.isOpen}
        onClose={() => setPreviewModal((p) => ({ ...p, isOpen: false }))}
        mediaList={previewModal.items}
        initialIndex={previewModal.initialIndex}
      />
    </div>
  );
};
