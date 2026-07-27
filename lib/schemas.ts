import { z } from 'zod';

export const NgoReceiptSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  donorName: z.string().min(1, 'Donor name is required'),
  amount: z.coerce.number().min(1, 'Amount must be greater than 0'),
  panNumber: z.string()
    .transform(val => val.replace(/\s+/g, '').toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'))
    .optional()
    .or(z.literal('')),
});

export const FactoryWeightSlipSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  vehicleNumber: z.string().min(1, 'Vehicle number is required'),
  grossWeight: z.coerce.number().min(1, 'Gross weight is required'),
  tareWeight: z.coerce.number().min(1, 'Tare weight is required'),
});

export type NgoReceiptData = z.infer<typeof NgoReceiptSchema>;
export type FactoryWeightSlipData = z.infer<typeof FactoryWeightSlipSchema>;
