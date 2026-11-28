/**
 * Police stations master data (police_stations): every station by district / unit, seeded from the AP Police
 * citizen portal (db/police-stations.sql). Read only in the app; maintained in the database.
 */
import { query } from '@/infrastructure/db/pool';

export interface PoliceStation {
  district: string;
  name: string;
  active: boolean;
}

/** Every station (optionally one district / unit), by district then name. */
export async function listPoliceStations(district?: string): Promise<PoliceStation[]> {
  const res = await query<PoliceStation>(
    `SELECT district, name, active FROM police_stations ${district ? 'WHERE district = $1' : ''}
      ORDER BY district, LOWER(name)`,
    district ? [district] : [],
  );
  return res.rows;
}
