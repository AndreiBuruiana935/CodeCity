export type ArchitecturalRole =
  | "controller"
  | "model"
  | "service"
  | "component"
  | "middleware"
  | "config"
  | "test"
  | "utility"
  | "route"
  | "migration"
  | "hook"
  | "type"
  | "entry";

export interface FunctionInfo {
  name: string;
  lines: string;
  complexity: number;
  params: string[];
}

export interface Building {
  id: string;
  filename: string;
  path: string;
  height: number;
  color: string;
  colorLabel: string;
  riskScore: number;
  complexity: number;
  dependencies: string[];
  dependencyCount: number;
  linesOfCode: number;
  entryPoint: boolean;
  securitySensitive: boolean;
  functions: FunctionInfo[];
  aiSummary: string;
  aiWarnings: string[];
  readingListPriority: number;
  status?: "available" | "unavailable" | "binary";
  architecturalRole?: ArchitecturalRole;
  aiLayer?: "database" | "backend" | "api" | "frontend";
  circularDeps?: string[];
  testFile?: string;
}

export interface District {
  id: string;
  name: string;
  type: "folder";
  buildings: Building[];
}

export interface DistrictDetails {
  id: string;
  name: string;
  neighborhood: string;
  buildingCount: number;
  subdistrictCount: number;
  totalLinesOfCode: number;
  averageRisk: number;
  maxRisk: number;
  description: string;
  topFiles: string[];
}

export interface Road {
  from: string;
  to: string;
  type: "import" | "type-import" | "circular" | "cross-layer";
  weight: number;
}

export interface CitySchema {
  city: {
    name: string;
    language: string;
    framework: string;
    architecture: string;
    districts: District[];
    roads: Road[];
    entryPoints: string[];
    hotspots: string[];
    fileRoles?: { file: string; role: ArchitecturalRole; layer: "database" | "backend" | "api" | "frontend"; confidence: number }[];
    circularDependencies?: { fileA: string; fileB: string }[];
    testCoverage?: { covered: string[]; uncovered: string[] };
  };
}

export interface OnboardingSummary {
  plainEnglish: string;
  guidedTour: TourStop[];
  readingList: ReadingListItem[];
  riskReport: RiskReportItem[];
}

export interface TourStop {
  stop: number;
  label: string;
  file: string;
  buildingId: string;
  description: string;
}

export interface ReadingListItem {
  priority: number;
  file: string;
  buildingId: string;
  reason: string;
  estimatedMinutes: number;
}

export interface RiskReportItem {
  rank: number;
  file: string;
  buildingId: string;
  riskScore: number;
  warnings: string[];
}

export interface QuestionResponse {
  answer: string;
  highlightedBuildings: string[];
  cameraFlyTo: string | null;
  relatedDistricts: string[];
  confidence: number;
  detectedLanguage?: string;
  responseType?: "explanation" | "highlight" | "tour" | "readingList";
}

export interface AnalyzeRequest {
  repoUrl: string;
  options?: {
    depth?: "full" | "shallow";
    includeTests?: boolean;
    githubToken?: string;
  };
}

export interface AnalyzeResponse {
  city: CitySchema;
  onboarding: OnboardingSummary;
}
