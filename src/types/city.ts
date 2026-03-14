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
}

export interface District {
  id: string;
  name: string;
  type: "folder";
  buildings: Building[];
}

export interface Road {
  from: string;
  to: string;
  type: "import";
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
