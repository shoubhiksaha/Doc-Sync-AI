import { parseNumber } from '@/core/text';
import { fieldValue } from './fields';
import type { DocumentProfile } from './types';

const AMOUNT = ['amount', 'donationAmount', 'totalAmount', 'amountReceived'];
const PAN = ['panNumber', 'pan', 'donorPan', 'panNo'];
const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export const ngoReceipt: DocumentProfile = {
  id: 'ngo-receipt',
  title: 'NGO Donation Receipts',
  documentName: 'NGO Donation Receipt',
  description: 'Extract donor details, amount, PAN, and date from handwritten trust receipts.',
  sheetTab: 'NGO_Receipts',
  sheetTitle: 'DocSync — NGO Receipts',
  sampleDocument: { href: '/sample-ngo-receipt.png', fileName: 'Sample_NGO_Receipt.png' },
  extraction: {
    context: 'This is an Indian NGO donation receipt. Typical fields: receipt number, date, donor name, donor address, amount, payment mode, donor PAN, NGO name and 80G registration reference.',
    priorityFields: ['Date', 'Donor Name', 'Amount', 'PAN Number', 'Receipt Number'],
  },
  mockFields: [
    { key: 'date', label: 'Date', value: '24-Oct-2023', confidence: 95, category: 'date' },
    { key: 'receiptNumber', label: 'Receipt Number', value: 'REC-2023-4521', confidence: 88, category: 'identity' },
    { key: 'donorName', label: 'Donor Name', value: 'Rahul Sharma', confidence: 97, category: 'identity' },
    { key: 'amount', label: 'Amount', value: '₹5,000', confidence: 99, category: 'financial' },
    { key: 'paymentMode', label: 'Payment Mode', value: 'Cheque', confidence: 85, category: 'financial' },
    { key: 'panNumber', label: 'PAN Number', value: 'ABCDE1234F', confidence: 91, category: 'identity' },
    { key: 'ngoName', label: 'NGO Name', value: 'Help India Foundation', confidence: 96, category: 'identity' },
    { key: 'section80g', label: 'Section 80G Ref', value: 'AAACH2345K/2023-24', confidence: 72, category: 'metadata' },
  ],
  notion: {
    titleFrom: ['donorName', 'donor', 'name'],
    dateFrom: ['date', 'receiptDate', 'donationDate'],
    properties: [
      { name: 'Amount', type: 'number', from: AMOUNT },
      { name: 'PAN', type: 'rich_text', from: PAN },
    ],
  },
  validate(fields) {
    const warnings: string[] = [];
    const amount = parseNumber(fieldValue(fields, AMOUNT));
    const pan = fieldValue(fields, PAN)?.replace(/\s+/g, '').toUpperCase();

    if (pan && !PAN_FORMAT.test(pan)) {
      warnings.push(`PAN "${pan}" doesn't match the format ABCDE1234F. Please check it.`);
    }
    if (amount !== null && amount > 2000 && !pan) {
      warnings.push(`Compliance: donations above ₹2,000 normally need the donor's PAN (₹${amount.toLocaleString('en-IN')} recorded, no PAN).`);
    }
    return warnings;
  },
};
