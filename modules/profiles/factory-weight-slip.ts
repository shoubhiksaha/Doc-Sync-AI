import { parseNumber } from '@/core/text';
import { fieldValue, findField } from './fields';
import type { DocumentProfile } from './types';

const GROSS = ['grossWeight', 'gross', 'grossWt'];
const TARE = ['tareWeight', 'tare', 'tareWt'];
const NET = ['netWeight', 'net', 'netWt'];

export const factoryWeightSlip: DocumentProfile = {
  id: 'factory-weight-slip',
  title: 'Factory Scrap Weight-Slips',
  documentName: 'Factory Weight-Slip',
  description: 'Extract vehicle no, gross weight, tare weight, and timestamp from kachha bills.',
  sheetTab: 'Factory_Slips',
  sheetTitle: 'DocSync — Factory Weight Slips',
  extraction: {
    context: 'This is an Indian factory or scrap weighbridge slip (kachha bill). Typical fields: slip number, date and time, vehicle number, material, party name, gross weight, tare weight and net weight with units.',
    priorityFields: ['Date', 'Vehicle Number', 'Gross Weight', 'Tare Weight', 'Net Weight'],
  },
  mockFields: [
    { key: 'date', label: 'Date', value: '24-Oct-2023', confidence: 95, category: 'date' },
    { key: 'vehicleNumber', label: 'Vehicle Number', value: 'MH-12-AB-1234', confidence: 93, category: 'identity' },
    { key: 'material', label: 'Material', value: 'Iron Scrap', confidence: 80, category: 'other' },
    { key: 'grossWeight', label: 'Gross Weight', value: '15000', confidence: 97, category: 'financial' },
    { key: 'tareWeight', label: 'Tare Weight', value: '5000', confidence: 96, category: 'financial' },
  ],
  notion: {
    titleFrom: ['vehicleNumber', 'vehicleNo', 'vehicle'],
    dateFrom: ['date', 'slipDate'],
    properties: [
      { name: 'Gross Weight', type: 'number', from: GROSS },
      { name: 'Tare Weight', type: 'number', from: TARE },
      { name: 'Net Weight', type: 'number', from: NET },
    ],
  },
  derive(fields) {
    if (findField(fields, NET)) return fields;
    const gross = parseNumber(fieldValue(fields, GROSS));
    const tare = parseNumber(fieldValue(fields, TARE));
    if (gross === null || tare === null) return fields;
    return [...fields, { key: 'netWeight', label: 'Net Weight', value: String(gross - tare), confidence: 100, category: 'financial' }];
  },
  validate(fields) {
    const warnings: string[] = [];
    const gross = parseNumber(fieldValue(fields, GROSS));
    const tare = parseNumber(fieldValue(fields, TARE));
    const net = parseNumber(fieldValue(fields, NET));

    if (gross !== null && tare !== null) {
      if (tare >= gross) {
        warnings.push(`Tare weight (${tare}) is not less than gross weight (${gross}). Please check the slip.`);
      } else if (net !== null && Math.abs(gross - tare - net) > 0.5) {
        warnings.push(`Net weight (${net}) doesn't equal gross − tare (${gross - tare}).`);
      }
    }
    return warnings;
  },
};
