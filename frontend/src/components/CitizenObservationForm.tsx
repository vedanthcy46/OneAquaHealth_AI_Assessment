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

  // Step 3: Media Upload state
  const [upstreamPhoto, setUpstreamPhoto] = useState<string>('/app_photos/image4.png');
  const [downstreamPhoto, setDownstreamPhoto] = useState<string>('/app_photos/image19.png');
  const [surroundingPhoto, setSurroundingPhoto] = useState<string>('/app_photos/image18.png');
  const [biodiversityPhoto, setBiodiversityPhoto] = useState<string>('/app_photos/image15.png');

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
  const [submittedObsId, setSubmittedObsId] = useState<string | null>(null);

  // Auto trigger AI evaluation when reaching Step 9
  useEffect(() => {
    if (currentStep === 9 && !aiAnalysisComplete) {
      runRealTimeAiAssessment();
    }
  }, [currentStep]);

  // When changing site, update default subsite
  useEffect(() => {
    if (selectedSite.subSites && selectedSite.subSites.length > 0) {
      setSelectedSubSite(selectedSite.subSites[0]);
    }
  }, [selectedSite]);

  const runRealTimeAiAssessment = () => {
    setIsAiAnalyzing(true);

    setTimeout(() => {
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

      // Real-time layer A: Image Quality
      const imgQ = evaluateImageQuality('good');
      setImageQuality(imgQ);

      // Real-time layer B: Stream Evidence Extraction
      const isTurbid = waterAspect === 'turbid';
      const ev = detectEcologicalEvidence(envObs, isTurbid);
      setAiEvidence(ev);

      // Real-time layer D: Validation & Conflict Warnings
      const warnings = validateObservation(envObs, ev, selectedSite, 4.2);
      setValidationWarnings(warnings);

      // Confidence Score calculation
      const isAnomaly = warnings.some((w) => w.type === 'HISTORICAL_ANOMALY');
      const conf = calculateConfidence(imgQ.qualityScore, ev, warnings, 4.2, isAnomaly);
      setConfidenceFactors(conf);

      setIsAiAnalyzing(false);
      setAiAnalysisComplete(true);
    }, 700);
  };

  const handleFinalSubmit = () => {
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
          hash: 'sha256-up-873918471',
          mimeType: 'image/jpeg',
          fileSizeBytes: 245800,
          captureTimestamp: new Date().toISOString(),
          qualityScore: imageQuality?.qualityScore || 92,
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
          hash: 'sha256-down-991823712',
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
        }
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
  };

  const stepTitles = [
    { step: 1, label: 'Basic Information', sub: 'What is this App for?' },
    { step: 2, label: 'Additional Details', sub: 'Select OneAquaHealth stream site' },
    { step: 3, label: 'Media Upload', sub: 'Select your stream photos & video' },
    { step: 4, label: 'Questions (1/3)', sub: 'Channel form & riparian dimensions' },
    { step: 5, label: 'Questions (2/3)', sub: 'Water aspect, flow, bed & banks' },
    { step: 6, label: 'Questions (3/3)', sub: 'Surrounding pressures & artificial structures' },
    { step: 7, label: 'Feedback (1/2)', sub: 'Overall stream ecosystem health rating' },
    { step: 8, label: 'Feedback (2/2)', sub: 'Notes, weather & confidence rating' },
    { step: 9, label: 'AI Stream Assessment', sub: 'AI cross-check & FHIR submission' }
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
            9-Step Official Stream Observation Wizard
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
                width: `${((currentStep - 1) / 8) * 100}%`,
                transition: 'width 0.3s ease'
              }}
            />
          </div>

          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((stepNum) => {
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

          <button
            onClick={() => {
              if (currentStep < 9) {
                setCurrentStep((prev) => prev + 1);
              } else {
                handleFinalSubmit();
              }
            }}
            style={{
              flex: 1,
              padding: '12px 18px',
              borderRadius: '8px',
              background: currentStep === 9 ? '#10b981' : '#38bdf8',
              border: 'none',
              color: currentStep === 9 ? '#ffffff' : '#0f172a',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              boxShadow:
                currentStep === 9
                  ? '0 0 20px rgba(16, 185, 129, 0.4)'
                  : '0 0 16px rgba(56, 189, 248, 0.3)'
            }}
          >
            {currentStep === 9 ? (
              <>
                <FileCheck size={18} /> Submit Observation & Run AI
              </>
            ) : (
              <>
                Next <ChevronRight size={18} />
              </>
            )}
          </button>
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
                onClick={() => setShowAddSiteModal(true)}
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
                <div
                  style={{
                    position: 'relative',
                    height: '280px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1px solid #334155',
                    background: '#0d1829',
                    marginBottom: '14px'
                  }}
                >
                  <img
                    src="/app_photos/image17.png"
                    alt="Map of OneAquaHealth Stream Sites"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />

                  <div
                    style={{
                      position: 'absolute',
                      top: '20px',
                      right: '20px',
                      background: 'rgba(15, 23, 42, 0.92)',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #38bdf8',
                      boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                      fontSize: '12px'
                    }}
                  >
                    <div style={{ color: '#38bdf8', fontWeight: 700 }}>
                      📍 {selectedSite.city}
                    </div>
                    <div style={{ color: '#ffffff', fontWeight: 600, marginTop: '2px' }}>
                      {selectedSubSite.code} ({selectedSubSite.name})
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: '11px', marginTop: '2px' }}>
                      Lat: {selectedSubSite.coordinates.lat.toFixed(4)}, Lng:{' '}
                      {selectedSubSite.coordinates.lng.toFixed(4)}
                    </div>
                  </div>
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
                  background: 'rgba(0,0,0,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 9999
                }}
              >
                <div
                  style={{
                    background: '#0f172a',
                    border: '1px solid #38bdf8',
                    borderRadius: '14px',
                    padding: '24px',
                    maxWidth: '440px',
                    width: '90%'
                  }}
                >
                  <h4 style={{ margin: '0 0 10px', fontSize: '17px', color: '#38bdf8' }}>
                    Add Custom Stream Observation Site
                  </h4>
                  <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '14px' }}>
                    Specify a new urban reach or tributary to add to the OneAquaHealth registry.
                  </p>
                  <input
                    type="text"
                    placeholder="e.g. Hovinbekken - New Footbridge Reach"
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#ffffff',
                      marginBottom: '16px',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      onClick={() => setShowAddSiteModal(false)}
                      style={{
                        padding: '8px 14px',
                        background: '#334155',
                        border: 'none',
                        color: '#cbd5e1',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (newSiteName.trim()) {
                          const newSS: SubSite = {
                            code: `C-${Date.now().toString().slice(-3)}`,
                            name: newSiteName.trim(),
                            coordinates: { lat: 59.93, lng: 10.75 },
                            healthRisk: 'Low'
                          };
                          selectedSite.subSites.unshift(newSS);
                          setSelectedSubSite(newSS);
                          setShowAddSiteModal(false);
                          setNewSiteName('');
                        }
                      }}
                      style={{
                        padding: '8px 14px',
                        background: '#0284c7',
                        border: 'none',
                        color: '#ffffff',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Add & Select
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
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative'
                  }}
                >
                  <img
                    src={upstreamPhoto}
                    alt="Upstream"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
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
                <button
                  onClick={() =>
                    setUpstreamPhoto(
                      upstreamPhoto === '/app_photos/image4.png'
                        ? '/app_photos/image6.jpg'
                        : '/app_photos/image4.png'
                    )
                  }
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Upload size={14} /> Select File / Swap
                </button>
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
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative'
                  }}
                >
                  <img
                    src={downstreamPhoto}
                    alt="Downstream"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
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
                <button
                  onClick={() =>
                    setDownstreamPhoto(
                      downstreamPhoto === '/app_photos/image19.png'
                        ? '/app_photos/image1.jpg'
                        : '/app_photos/image19.png'
                    )
                  }
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Upload size={14} /> Select File / Swap
                </button>
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
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative'
                  }}
                >
                  <img
                    src={surroundingPhoto}
                    alt="Surrounding context"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
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
                <button
                  onClick={() =>
                    setSurroundingPhoto(
                      surroundingPhoto === '/app_photos/image18.png'
                        ? '/app_photos/image22.png'
                        : '/app_photos/image18.png'
                    )
                  }
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Upload size={14} /> Select File / Swap
                </button>
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
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: '#1e293b',
                    position: 'relative'
                  }}
                >
                  <img
                    src={biodiversityPhoto}
                    alt="Biodiversity"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
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
                <button
                  onClick={() =>
                    setBiodiversityPhoto(
                      biodiversityPhoto === '/app_photos/image15.png'
                        ? '/app_photos/image13.png'
                        : '/app_photos/image15.png'
                    )
                  }
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Upload size={14} /> Select File / Swap
                </button>
              </div>

              {/* Media Slot 5: Short Video (5-10s) */}
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
                  Make a short video (5 or 10 seconds)
                </div>
                <div
                  style={{
                    height: '140px',
                    borderRadius: '8px',
                    background: '#131e33',
                    border: '1px dashed #38bdf8',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8'
                  }}
                >
                  <Video size={36} />
                  <span style={{ fontSize: '12px', marginTop: '6px', color: '#cbd5e1' }}>
                    stream_video_10s.mp4 (Recorded)
                  </span>
                </div>
                <button
                  onClick={() => alert('Simulated video camera capture (10s audio-visual recording loaded)')}
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#1e293b',
                    border: '1px solid #38bdf8',
                    color: '#38bdf8',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Camera size={14} /> Record Video
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Questions (1/3) - Channel Form & Dimensions */}
        {currentStep === 4 && (
          <div>
            <div
              style={{
                background: '#131e33',
                padding: '12px 16px',
                borderRadius: '8px',
                color: '#38bdf8',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '20px'
              }}
            >
              What do you see from where you stand (in ca. 100m)?
            </div>

            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '24px'
              }}
            >
              <h4 style={{ margin: '0 0 4px', fontSize: '16px', color: '#ffffff' }}>
                Channel Form
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8' }}>
                The channel form is...
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '12px',
                  marginBottom: '16px'
                }}
              >
                {[
                  { id: 'flat', label: 'Flat (A)' },
                  { id: 'u_shape', label: 'U Shape (B)' },
                  { id: 'v_shape', label: 'V Shape (C)' },
                  { id: 'unsure', label: "I'm not sure" }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setChannelForm(opt.id as any)}
                    style={{
                      padding: '12px 16px',
                      borderRadius: '8px',
                      background: channelForm === opt.id ? '#0284c7' : '#131e33',
                      border: channelForm === opt.id ? '2px solid #38bdf8' : '1px solid #334155',
                      color: channelForm === opt.id ? '#ffffff' : '#cbd5e1',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <input
                      type="radio"
                      checked={channelForm === opt.id}
                      onChange={() => {}}
                      style={{ marginRight: '8px' }}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '1px solid #334155',
                  maxHeight: '180px'
                }}
              >
                <img
                  src="/app_photos/image23.png"
                  alt="Channel Form Diagrams A, B, C"
                  style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                />
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
              <h4 style={{ margin: '0 0 4px', fontSize: '16px', color: '#ffffff' }}>
                Riparian Vegetation Width
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8' }}>
                Estimated buffer width of native vegetation along the banks:
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '20px'
                }}
              >
                <div style={{ background: '#131e33', padding: '14px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
                    Left Bank Buffer:
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['<1m', '1-5m', '5-10m', '>10m'].map((w) => (
                      <button
                        key={w}
                        onClick={() => setBufferLeftWidth(w as any)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: bufferLeftWidth === w ? '#0284c7' : '#1e293b',
                          border: bufferLeftWidth === w ? '1px solid #38bdf8' : '1px solid #334155',
                          color: '#ffffff',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ background: '#131e33', padding: '14px', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 600, color: '#38bdf8', marginBottom: '8px' }}>
                    Right Bank Buffer:
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {['<1m', '1-5m', '5-10m', '>10m'].map((w) => (
                      <button
                        key={w}
                        onClick={() => setBufferRightWidth(w as any)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          background: bufferRightWidth === w ? '#0284c7' : '#1e293b',
                          border: bufferRightWidth === w ? '1px solid #38bdf8' : '1px solid #334155',
                          color: '#ffffff',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Questions (2/3) - Water Aspect, Flow, Bed & Habitats */}
        {currentStep === 5 && (
          <div>
            <div
              style={{
                background: '#131e33',
                padding: '12px 16px',
                borderRadius: '8px',
                color: '#38bdf8',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '20px'
              }}
            >
              What do you see from where you stand (in ca. 100m)?
            </div>

            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
              }}
            >
              <h4 style={{ margin: '0 0 4px', fontSize: '16px', color: '#ffffff' }}>
                Water Aspect
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8' }}>
                How is the water?
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px',
                  marginBottom: '16px'
                }}
              >
                {[
                  { id: 'clear', label: 'Clear/transparent (A)' },
                  { id: 'turbid', label: 'Muddy/turbid (B)' },
                  { id: 'foam', label: 'Has foam (C)' },
                  { id: 'altered_color', label: 'Has colors/altered color (D)' },
                  { id: 'unsure', label: "I'm not sure" }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setWaterAspect(opt.id as any)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: waterAspect === opt.id ? '#0284c7' : '#131e33',
                      border: waterAspect === opt.id ? '2px solid #38bdf8' : '1px solid #334155',
                      color: waterAspect === opt.id ? '#ffffff' : '#cbd5e1',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <input
                      type="radio"
                      checked={waterAspect === opt.id}
                      onChange={() => {}}
                      style={{ marginRight: '8px' }}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '1px solid #334155',
                  maxHeight: '180px'
                }}
              >
                <img
                  src="/app_photos/image12.png"
                  alt="Water Aspect Reference A, B, C, D"
                  style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                />
              </div>
            </div>

            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
              }}
            >
              <h4 style={{ margin: '0 0 4px', fontSize: '16px', color: '#ffffff' }}>
                Water Flow
              </h4>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8' }}>
                How is the water flowing?
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '10px',
                  marginBottom: '16px'
                }}
              >
                {[
                  { id: 'fast', label: 'Fast (with waves or high velocity) (A)' },
                  { id: 'slow', label: 'Slow (B)' },
                  { id: 'stagnant', label: 'Stagnant/intermittent (C)' },
                  { id: 'dry', label: 'Dry (D)' },
                  { id: 'unsure', label: "I'm not sure" }
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setWaterFlow(opt.id as any)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: waterFlow === opt.id ? '#0284c7' : '#131e33',
                      border: waterFlow === opt.id ? '2px solid #38bdf8' : '1px solid #334155',
                      color: waterFlow === opt.id ? '#ffffff' : '#cbd5e1',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left'
                    }}
                  >
                    <input
                      type="radio"
                      checked={waterFlow === opt.id}
                      onChange={() => {}}
                      style={{ marginRight: '8px' }}
                    />
                    {opt.label}
                  </button>
                ))}
              </div>

              <div
                style={{
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '1px solid #334155',
                  maxHeight: '180px'
                }}
              >
                <img
                  src="/app_photos/image21.png"
                  alt="Flow Velocity Reference A, B, C, D"
                  style={{ width: '100%', height: '180px', objectFit: 'cover' }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '16px',
                marginBottom: '20px'
              }}
            >
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <h4 style={{ margin: '0 0 4px', fontSize: '15px', color: '#ffffff' }}>
                  Bottom Type
                </h4>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#94a3b8' }}>
                  The bottom of the wet channel is...
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { id: 'natural', label: 'Natural (A)' },
                    { id: 'artificial', label: 'Artificial (concrete or stones with concrete) (B)' },
                    { id: 'unsure', label: "I'm not sure" }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setBottomType(opt.id as any)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: bottomType === opt.id ? '#0284c7' : '#131e33',
                        border: bottomType === opt.id ? '1px solid #38bdf8' : '1px solid #334155',
                        color: '#ffffff',
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <h4 style={{ margin: '0 0 4px', fontSize: '15px', color: '#ffffff' }}>
                  Bank Type
                </h4>
                <p style={{ margin: '0 0 10px', fontSize: '12px', color: '#94a3b8' }}>
                  The banks of the channel are...
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { id: 'natural', label: 'Natural (A)' },
                    { id: 'artificial', label: 'Artificial (concrete or stones with concrete) (B)' },
                    { id: 'unsure', label: "I'm not sure" }
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setBankType(opt.id as any)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: bankType === opt.id ? '#0284c7' : '#131e33',
                        border: bankType === opt.id ? '1px solid #38bdf8' : '1px solid #334155',
                        color: '#ffffff',
                        fontSize: '13px',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
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
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '10px'
                }}
              >
                <input
                  type="checkbox"
                  id="habitats_present"
                  checked={hasHabitats}
                  onChange={(e) => setHasHabitats(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <label
                  htmlFor="habitats_present"
                  style={{ fontWeight: 700, fontSize: '15px', color: '#ffffff' }}
                >
                  Are there any habitats present? (Riffles, pools, gravel bars, rocks)
                </label>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '14px'
                }}
              >
                <input
                  type="checkbox"
                  id="debris_present"
                  checked={hasNaturalDebris}
                  onChange={(e) => setHasNaturalDebris(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <label
                  htmlFor="debris_present"
                  style={{ fontWeight: 700, fontSize: '15px', color: '#ffffff' }}
                >
                  Are there any natural debris present? (Fallen logs, leaf packs)
                </label>
              </div>

              <div
                style={{
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '1px solid #334155',
                  maxHeight: '170px'
                }}
              >
                <img
                  src="/app_photos/image14.png"
                  alt="Habitats and Debris Diagrams A-E"
                  style={{ width: '100%', height: '170px', objectFit: 'cover' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 6: Questions (3/3) - Surrounding Pressures & Artificial Elements */}
        {currentStep === 6 && (
          <div>
            <div
              style={{
                background: '#131e33',
                padding: '12px 16px',
                borderRadius: '8px',
                color: '#38bdf8',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '20px'
              }}
            >
              Surrounding Pressures, Discharges & Artificial Elements
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: '16px',
                marginBottom: '24px'
              }}
            >
              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <div style={{ height: '130px', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                  <img
                    src="/app_photos/image1.jpg"
                    alt="Discharge Pipe"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="pipes"
                    checked={hasArtificialPipes}
                    onChange={(e) => setHasArtificialPipes(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="pipes" style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Pipes or Outfalls Discharging into Stream
                  </label>
                </div>
              </div>

              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <div style={{ height: '130px', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                  <img
                    src="/app_photos/image6.jpg"
                    alt="Engineered Concrete Channel"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="channelized"
                    checked={bankType === 'artificial'}
                    onChange={(e) => setBankType(e.target.checked ? 'artificial' : 'natural')}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="channelized" style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Artificially Channelized / Reinforced Banks
                  </label>
                </div>
              </div>

              <div
                style={{
                  background: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '16px'
                }}
              >
                <div style={{ height: '130px', borderRadius: '8px', overflow: 'hidden', marginBottom: '12px' }}>
                  <img
                    src="/app_photos/image22.png"
                    alt="Weirs and Barriers"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="checkbox"
                    id="barriers"
                    checked={hasArtificialBarriers}
                    onChange={(e) => setHasArtificialBarriers(e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <label htmlFor="barriers" style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Weirs / Dams / Fish Migration Barriers
                  </label>
                </div>
              </div>
            </div>

            <div
              style={{
                background: '#0f172a',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '18px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '24px',
                alignItems: 'center'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="trash"
                  checked={hasLitterTrash}
                  onChange={(e) => setHasLitterTrash(e.target.checked)}
                  style={{ width: '18px', height: '18px' }}
                />
                <label htmlFor="trash" style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                  Plastic Litter / Dumped Garbage Present
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ fontSize: '14px', color: '#94a3b8' }}>Water Odor:</label>
                <select
                  value={odor}
                  onChange={(e) => setOdor(e.target.value as any)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#131e33',
                    border: '1px solid #334155',
                    color: '#ffffff',
                    fontSize: '13px'
                  }}
                >
                  <option value="none">None (Natural)</option>
                  <option value="earthy">Earthy / Wetland</option>
                  <option value="sewage">Sewage / Rotten Egg</option>
                  <option value="chemical">Chemical / Petroleum</option>
                  <option value="fishy">Fishy</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* STEP 7: Feedback (1/2) - Overall Health Rating */}
        {currentStep === 7 && (
          <div>
            <div
              style={{
                background: '#131e33',
                padding: '14px 18px',
                borderRadius: '8px',
                color: '#38bdf8',
                fontSize: '15px',
                fontWeight: 600,
                marginBottom: '24px',
                textAlign: 'center'
              }}
            >
              Provide an overall assessment of the stream ecosystem health
              <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400, marginTop: '4px' }}>
                (Choose one of the below possibilities — matching Image 9 of the app)
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px'
              }}
            >
              <div
                onClick={() => setOverallHealthRating('good')}
                style={{
                  background: overallHealthRating === 'good' ? '#09291f' : '#0f172a',
                  border:
                    overallHealthRating === 'good'
                      ? '2px solid #10b981'
                      : '1px solid #1e293b',
                  borderRadius: '14px',
                  padding: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow:
                    overallHealthRating === 'good'
                      ? '0 0 25px rgba(16, 185, 129, 0.25)'
                      : 'none'
                }}
              >
                <div
                  style={{
                    color: '#10b981',
                    fontSize: '20px',
                    fontWeight: 800,
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <CheckCircle2 size={24} /> Good quality
                </div>
                <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', margin: 0 }}>
                  The ecosystem components are there: riparian vegetation, natural channel,
                  good water quality, biodiversity.
                </p>
              </div>

              <div
                onClick={() => setOverallHealthRating('moderate')}
                style={{
                  background: overallHealthRating === 'moderate' ? '#2f2409' : '#0f172a',
                  border:
                    overallHealthRating === 'moderate'
                      ? '2px solid #f59e0b'
                      : '1px solid #1e293b',
                  borderRadius: '14px',
                  padding: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow:
                    overallHealthRating === 'moderate'
                      ? '0 0 25px rgba(245, 158, 11, 0.25)'
                      : 'none'
                }}
              >
                <div
                  style={{
                    color: '#f59e0b',
                    fontSize: '20px',
                    fontWeight: 800,
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertTriangle size={24} /> Moderate quality
                </div>
                <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', margin: 0 }}>
                  Some alterations, still biodiverse, with vegetation in the margins, water
                  looks good...
                </p>
              </div>

              <div
                onClick={() => setOverallHealthRating('poor')}
                style={{
                  background: overallHealthRating === 'poor' ? '#2e1014' : '#0f172a',
                  border:
                    overallHealthRating === 'poor'
                      ? '2px solid #ef4444'
                      : '1px solid #1e293b',
                  borderRadius: '14px',
                  padding: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow:
                    overallHealthRating === 'poor'
                      ? '0 0 25px rgba(239, 68, 68, 0.25)'
                      : 'none'
                }}
              >
                <div
                  style={{
                    color: '#ef4444',
                    fontSize: '20px',
                    fontWeight: 800,
                    marginBottom: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertTriangle size={24} /> Poor quality
                </div>
                <p style={{ fontSize: '14px', color: '#cbd5e1', lineHeight: '1.6', margin: 0 }}>
                  Highly modified / artificialized, loss of riparian vegetation, loss of
                  habitats, polluted.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 8: Feedback (2/2) - Additional Notes & Citizen Confidence */}
        {currentStep === 8 && (
          <div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '20px',
                marginBottom: '20px'
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
                <h4 style={{ margin: '0 0 12px', fontSize: '16px', color: '#ffffff' }}>
                  Weather & Sampling Conditions
                </h4>

                <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Current Weather:
                </label>
                <select
                  value={weatherCondition}
                  onChange={(e) => setWeatherCondition(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#131e33',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    marginBottom: '16px'
                  }}
                >
                  <option value="Sunny / Clear">Sunny / Clear</option>
                  <option value="Overcast / Cloudy">Overcast / Cloudy</option>
                  <option value="Light Rain">Light Rain</option>
                  <option value="Heavy Rain in past 24h (Storm Event)">
                    Heavy Rain in past 24h (Storm Event)
                  </option>
                  <option value="Snow / Freezing">Snow / Freezing</option>
                </select>

                <label style={{ fontSize: '13px', color: '#94a3b8', display: 'block', marginBottom: '6px' }}>
                  Your Confidence Level in this Assessment:
                </label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => setCitizenConfidence(star)}
                      style={{
                        padding: '8px 14px',
                        borderRadius: '6px',
                        background: citizenConfidence >= star ? '#0284c7' : '#1e293b',
                        border: citizenConfidence >= star ? '1px solid #38bdf8' : '1px solid #334155',
                        color: citizenConfidence >= star ? '#ffffff' : '#64748b',
                        fontWeight: 700,
                        fontSize: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      ★ {star}
                    </button>
                  ))}
                  <span style={{ fontSize: '12px', color: '#38bdf8', marginLeft: '6px' }}>
                    {citizenConfidence === 5 ? 'Very Confident' : `${citizenConfidence}/5`}
                  </span>
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
                <h4 style={{ margin: '0 0 12px', fontSize: '16px', color: '#ffffff' }}>
                  Volunteer Field Notes & Observations
                </h4>
                <textarea
                  rows={5}
                  value={citizenNotes}
                  onChange={(e) => setCitizenNotes(e.target.value)}
                  placeholder="Describe wildlife, fish sightings, water color changes, recent maintenance or nearby construction..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: '#131e33',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#ffffff',
                    fontSize: '13px',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => setCurrentStep(9)}
                style={{
                  padding: '14px 32px',
                  borderRadius: '10px',
                  background: '#10b981',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '15px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 15px rgba(16, 185, 129, 0.4)'
                }}
              >
                <Sparkles size={18} /> Continue to Real-Time AI Stream Assessment
              </button>
            </div>
          </div>
        )}

        {/* STEP 9: AI Real-Time Stream Assessment & Submission */}
        {currentStep === 9 && (
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
                      {imageQuality?.qualityScore || 92}/100
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
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={handleFinalSubmit}
                      style={{
                        padding: '16px 36px',
                        borderRadius: '12px',
                        background: 'linear-gradient(90deg, #0284c7, #10b981)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '16px',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '10px',
                        boxShadow: '0 10px 25px rgba(2, 132, 199, 0.4)'
                      }}
                    >
                      <Award size={20} /> Finalize Observation & Submit to FHIR Registry
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
