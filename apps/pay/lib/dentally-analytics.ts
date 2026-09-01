export interface DentallyAnalyticsPatient {
  name: string;
  amount: number;
  durationMins?: number;
  treatment?: string;
  hourlyRate?: number;
}

export interface TopPatientByHourlyRate {
  name: string;
  amount: number;
  durationMins: number;
  hourlyRate: number;
}

export interface TopTreatmentByHourlyRate {
  treatment: string;
  totalAmount: number;
  totalMins: number;
  hourlyRate: number;
  count: number;
}

export interface DentallyAnalytics {
  totalChairMins: number;
  totalPatients: number;
  grossPerHour: number;
  netPerHour: number;
  avgAppointmentMins: number;
  utilizationPercent: number;
  topPatientsByHourlyRate: TopPatientByHourlyRate[];
  topTreatmentsByHourlyRate: TopTreatmentByHourlyRate[];
}

/** Legacy AuraPay dentist analytics (Y2.4). */
export function calculateDentistAnalytics(
  patients: DentallyAnalyticsPatient[],
  splitPercentage: number,
  weeklyHours = 40
): DentallyAnalytics {
  const patientsWithDuration = patients.filter((p) => p.durationMins && p.durationMins > 0);
  const totalChairMins = patientsWithDuration.reduce((sum, p) => sum + (p.durationMins || 0), 0);
  const totalAmount = patients.reduce((sum, p) => sum + p.amount, 0);
  const totalHours = totalChairMins / 60;
  const grossPerHour = totalHours > 0 ? totalAmount / totalHours : 0;
  const netPerHour = totalHours > 0 ? (totalAmount * (splitPercentage / 100)) / totalHours : 0;
  const avgAppointmentMins = patientsWithDuration.length > 0 ? totalChairMins / patientsWithDuration.length : 0;
  const monthlyAvailableHours = weeklyHours * 4.3;
  const utilizationPercent = monthlyAvailableHours > 0 ? (totalHours / monthlyAvailableHours) * 100 : 0;

  const topPatientsByHourlyRate = patientsWithDuration
    .map((p) => ({
      name: p.name,
      amount: p.amount,
      durationMins: p.durationMins || 0,
      hourlyRate: p.hourlyRate || 0,
    }))
    .filter((p) => p.hourlyRate > 0)
    .sort((a, b) => b.hourlyRate - a.hourlyRate)
    .slice(0, 10);

  const treatmentMap = new Map<string, { totalAmount: number; totalMins: number; count: number }>();
  for (const p of patientsWithDuration) {
    if (!p.treatment || !p.durationMins) continue;
    const treatment = p.treatment.toLowerCase().trim();
    const existing = treatmentMap.get(treatment) || { totalAmount: 0, totalMins: 0, count: 0 };
    existing.totalAmount += p.amount;
    existing.totalMins += p.durationMins;
    existing.count += 1;
    treatmentMap.set(treatment, existing);
  }

  const topTreatmentsByHourlyRate = Array.from(treatmentMap.entries())
    .map(([treatment, data]) => ({
      treatment,
      totalAmount: data.totalAmount,
      totalMins: data.totalMins,
      hourlyRate: data.totalMins > 0 ? data.totalAmount / (data.totalMins / 60) : 0,
      count: data.count,
    }))
    .sort((a, b) => b.hourlyRate - a.hourlyRate)
    .slice(0, 10);

  return {
    totalChairMins,
    totalPatients: patients.length,
    grossPerHour: Math.round(grossPerHour * 100) / 100,
    netPerHour: Math.round(netPerHour * 100) / 100,
    avgAppointmentMins: Math.round(avgAppointmentMins),
    utilizationPercent: Math.round(utilizationPercent * 10) / 10,
    topPatientsByHourlyRate,
    topTreatmentsByHourlyRate,
  };
}
