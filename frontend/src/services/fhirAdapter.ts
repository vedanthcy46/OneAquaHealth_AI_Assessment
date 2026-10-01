import type { Observation } from '../types';

// FHIR R4 Interoperability Adapter
// Conforms to hl7.eu.fhir.oah specification and AQUAGUARD_BUILD_PLAN.md Phase 10
export function toFHIRObservation(obs: Observation): Record<string, any> {
  const components: any[] = Object.entries(obs.envObservations).map(([key, val]) => ({
    code: {
      coding: [
        {
          system: 'http://hl7.eu/fhir/ig/oah/CodeSystem/oah-indicators',
          code: key,
          display: key.replace(/([A-Z])/g, ' $1').toLowerCase(),
        },
      ],
    },
    valueString: String(val),
  }));

  if (obs.aiResult?.evidence) {
    obs.aiResult.evidence.forEach((ev) => {
      components.push({
        code: {
          coding: [
            {
              system: 'http://hl7.eu/fhir/ig/oah/CodeSystem/oah-ai-evidence',
              code: ev.indicator,
              display: `AI Evidence: ${ev.indicator}`,
            },
          ],
        },
        valueString: `${ev.value} (confidence: ${(ev.confidence * 100).toFixed(0)}%)`,
      });
    });
  }

  return {
    resourceType: 'Observation',
    id: obs.id,
    meta: {
      profile: ['http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-stream-observation'],
      versionId: String(obs.version || 1),
      lastUpdated: obs.updatedAt || new Date().toISOString(),
    },
    status:
      obs.status === 'ACCEPTED'
        ? 'final'
        : obs.status === 'CORRECTED'
        ? 'amended'
        : 'preliminary',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'survey',
            display: 'Survey / Citizen Science',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://hl7.eu/fhir/ig/oah/CodeSystem/oah-indicators',
          code: 'stream-assessment',
          display: 'OneAquaHealth Stream Ecological Assessment',
        },
      ],
      text: 'Citizen Stream Health Observation',
    },
    subject: {
      reference: `Practitioner/${obs.observerId}`,
      display: obs.observerName || 'Citizen Observer',
    },
    effectiveDateTime: obs.observedAt,
    issued: obs.createdAt,
    performer: [
      {
        reference: `Practitioner/${obs.observerId}`,
        display: obs.observerName || 'Citizen Observer',
      },
    ],
    valueQuantity: obs.qualityScore
      ? {
          value: obs.qualityScore,
          unit: 'score',
          system: 'http://unitsofmeasure.org',
          code: '1',
        }
      : undefined,
    extension: [
      {
        url: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-confidence',
        valueInteger: obs.aiResult?.confidence || 0,
      },
      {
        url: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-routing',
        valueString: obs.aiResult?.routingDecision || 'PENDING',
      },
      {
        url: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-site',
        valueString: obs.siteName,
      },
      {
        url: 'http://hl7.eu/fhir/ig/oah/StructureDefinition/aquaguard-coordinates',
        extension: [
          { url: 'latitude', valueDecimal: obs.gps.lat },
          { url: 'longitude', valueDecimal: obs.gps.lng },
          { url: 'accuracyMeters', valueDecimal: obs.gps.accuracy },
        ],
      },
    ],
    component: components,
  };
}
