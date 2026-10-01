import { Observation, HumanReview, AIResult } from '../types';

/**
 * FHIR R4 Adapter
 * Maps AquaGuard canonical observation → HL7 FHIR R4 Observation resource
 * Aligns with: http://hl7.eu/fhir/ig/oah (OneAquaHealth FHIR IG)
 */
export class FHIRAdapter {
  toFHIRObservation(
    obs: Observation & { lat?: number; lng?: number },
    ai?: AIResult | null,
    review?: HumanReview | null
  ): Record<string, any> {
    const final = review?.final_assessment ?? obs.env_observations;
    const status = this.mapStatus(obs.status);

    const resource: Record<string, any> = {
      resourceType: 'Observation',
      id: obs.id,
      meta: {
        profile: ['http://hl7.eu/fhir/ig/oah/StructureDefinition/AquaGuardStreamObservation'],
        lastUpdated: obs.updated_at,
      },
      status,
      category: [
        {
          coding: [{
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'survey',
            display: 'Survey',
          }],
        },
      ],
      code: {
        coding: [{
          system: 'http://hl7.eu/fhir/ig/oah/CodeSystem/oah-indicators',
          code: 'stream-ecological-assessment',
          display: 'Stream Ecological Assessment',
        }],
        text: 'Citizen stream ecological assessment',
      },
      subject: obs.observer_id
        ? { reference: `Patient/${obs.observer_id}` }
        : undefined,
      focus: obs.site_id
        ? [{ reference: `Location/${obs.site_id}` }]
        : undefined,
      effectiveDateTime: obs.observed_at,
      issued: obs.created_at,

      // Components — one per ecological indicator
      component: this.buildComponents(final),

      // Extensions
      extension: [
        {
          url: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-confidence',
          valueInteger: ai?.confidence ?? null,
        },
        {
          url: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-routing',
          valueString: ai?.routing_decision ?? null,
        },
        {
          url: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-quality-score',
          valueInteger: obs.quality_score ?? null,
        },
        obs.lat && obs.lng ? {
          url: 'http://hl7.org/fhir/StructureDefinition/observation-bodyPosition',
          valueCodeableConcept: {
            text: `GPS: ${obs.lat}, ${obs.lng}`,
          },
        } : null,
      ].filter(Boolean),

      // Data provenance
      device: ai ? {
        display: `${ai.model} v${ai.model_version} (prompt: ${ai.prompt_version})`,
      } : undefined,
    };

    return resource;
  }

  private mapStatus(obsStatus: string): string {
    const map: Record<string, string> = {
      DRAFT:               'registered',
      SUBMITTED:           'preliminary',
      AI_CHECK:            'preliminary',
      VALID:               'preliminary',
      REVIEW_REQUIRED:     'preliminary',
      HUMAN_REVIEW:        'preliminary',
      ACCEPTED:            'final',
      CORRECTED:           'corrected',
      REJECTED:            'cancelled',
      RESUBMIT_REQUESTED:  'entered-in-error',
    };
    return map[obsStatus] ?? 'unknown';
  }

  private buildComponents(answers: Record<string, any>): any[] {
    const indicatorCodes: Record<string, { code: string; display: string }> = {
      waterClarity: { code: 'water-clarity',  display: 'Water Clarity' },
      odour:        { code: 'water-odour',     display: 'Water Odour' },
      debris:       { code: 'surface-debris',  display: 'Surface Debris' },
      flowRate:     { code: 'flow-rate',       display: 'Flow Rate' },
      channelType:  { code: 'channel-type',    display: 'Channel Type' },
      vegetation:   { code: 'vegetation',      display: 'Vegetation' },
    };

    return Object.entries(answers)
      .filter(([key]) => indicatorCodes[key])
      .map(([key, value]) => ({
        code: {
          coding: [{
            system: 'http://hl7.eu/fhir/ig/oah/CodeSystem/oah-stream-indicators',
            code: indicatorCodes[key].code,
            display: indicatorCodes[key].display,
          }],
        },
        valueString: String(value),
      }));
  }
}

export const fhirAdapter = new FHIRAdapter();
