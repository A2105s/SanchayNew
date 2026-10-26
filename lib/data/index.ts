import STATIONS_DATA from './gwalior-police-stations.json';
import DEPARTMENTS_DATA from './gwalior-departments.json';
import POLICE_DIRECTORY from './gwalior-police-directory.json';
import FLEET_BLUEPRINTS from './gwalior-fleet-blueprints.json';
import LEGAL_CASES_DATA from './gwalior-legal-cases.json';

export {
  STATIONS_DATA,
  DEPARTMENTS_DATA,
  POLICE_DIRECTORY,
  FLEET_BLUEPRINTS,
  LEGAL_CASES_DATA
};

export type GwaliorPoliceStation = (typeof STATIONS_DATA)[number];
export type GwaliorDepartment = (typeof DEPARTMENTS_DATA)[number];

export function getStationByCode(code: string): GwaliorPoliceStation | undefined {
  return STATIONS_DATA.find((s) => s.code === code || s.id === code);
}

export function getDepartmentByCode(code: string): GwaliorDepartment | undefined {
  return DEPARTMENTS_DATA.find((d) => d.code === code);
}

export function getAllGwaliorStations(): GwaliorPoliceStation[] {
  return STATIONS_DATA;
}

export function getPoliceDirectory() {
  return POLICE_DIRECTORY;
}
