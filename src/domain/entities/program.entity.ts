import type { ProgramType } from '../enums/program-type.enum.js';
import { Modality } from '../enums/modality.enum.js';
import { DomainException } from '../exceptions/domain.exception.js';

export type ProgramStatus = 'active' | 'inactive';

export interface ProgramModalityEntry {
  careerType: string;
  modalities: Modality[];
}

export interface ProgramFaqEntry {
  question: string;
  answer: string;
}

export interface ProgramCostEntry {
  currency: string;
  thesisFolderFee: number;
  bachelorFolderFee: number;
}

export interface ProgramProps {
  id: string;
  name: string;
  types: [ProgramType, ...ProgramType[]];
  facultyId: string;
  duration: string;
  modalities: [ProgramModalityEntry, ...ProgramModalityEntry[]];
  academicDegree: string;
  professionalTitle: string;
  brochureUrl: string;
  summary: string;
  sellingPoints: string[];
  tags: string[];
  questionsAnswered: string[];
  faq: ProgramFaqEntry[];
  graduateProfile: string;
  jobOpportunities: string[];
  objective: string;
  coverImage: string;
  gallery: string[];
  promoVideoUrl: string;
  admissionRequirements: string[];
  whatsappContact: string;
  applicationFormUrl: string;
  thesisFolderFee: number;
  slug: string;
  status: ProgramStatus;
  directorId: string;
  teacherIds: string[];
  totalCredits: number;
  userId: string;
  searchText: string;
  scheduleDescription: string;
  bachelorFolderFee: number;
  costs: ProgramCostEntry[];
  iaInformation: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Same as ProgramProps but tolerates missing/incomplete DB fields produced by the admin panel. */
export type PartialProgramProps = Omit<ProgramProps, 'modalities' | 'iaInformation'> & {
  modalities: ProgramModalityEntry[];
  iaInformation?: string;
};

/**
 * Domain entity representing an academic program offered by the institution.
 */
export class Program {
  readonly id: string;
  readonly name: string;
  readonly types: ReadonlyArray<ProgramType>;
  readonly facultyId: string;
  readonly duration: string;
  readonly modalities: ReadonlyArray<ProgramModalityEntry>;
  readonly academicDegree: string;
  readonly professionalTitle: string;
  readonly brochureUrl: string;
  readonly summary: string;
  readonly sellingPoints: ReadonlyArray<string>;
  readonly tags: ReadonlyArray<string>;
  readonly questionsAnswered: ReadonlyArray<string>;
  readonly faq: ReadonlyArray<ProgramFaqEntry>;
  readonly graduateProfile: string;
  readonly jobOpportunities: ReadonlyArray<string>;
  readonly objective: string;
  readonly coverImage: string;
  readonly gallery: ReadonlyArray<string>;
  readonly promoVideoUrl: string;
  readonly admissionRequirements: ReadonlyArray<string>;
  readonly whatsappContact: string;
  readonly applicationFormUrl: string;
  readonly thesisFolderFee: number;
  readonly slug: string;
  readonly status: ProgramStatus;
  readonly directorId: string;
  readonly teacherIds: ReadonlyArray<string>;
  readonly totalCredits: number;
  readonly userId: string;
  readonly searchText: string;
  readonly scheduleDescription: string;
  readonly bachelorFolderFee: number;
  readonly costs: ReadonlyArray<ProgramCostEntry>;
  readonly iaInformation: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  private constructor(props: ProgramProps) {
    this.id = props.id;
    this.name = props.name;
    this.types = props.types;
    this.facultyId = props.facultyId;
    this.duration = props.duration;
    this.modalities = props.modalities;
    this.academicDegree = props.academicDegree;
    this.professionalTitle = props.professionalTitle;
    this.brochureUrl = props.brochureUrl;
    this.summary = props.summary;
    this.sellingPoints = props.sellingPoints;
    this.tags = props.tags;
    this.questionsAnswered = props.questionsAnswered;
    this.faq = props.faq;
    this.graduateProfile = props.graduateProfile;
    this.jobOpportunities = props.jobOpportunities;
    this.objective = props.objective;
    this.coverImage = props.coverImage;
    this.gallery = props.gallery;
    this.promoVideoUrl = props.promoVideoUrl;
    this.admissionRequirements = props.admissionRequirements;
    this.whatsappContact = props.whatsappContact;
    this.applicationFormUrl = props.applicationFormUrl;
    this.thesisFolderFee = props.thesisFolderFee;
    this.slug = props.slug;
    this.status = props.status;
    this.directorId = props.directorId;
    this.teacherIds = props.teacherIds;
    this.totalCredits = props.totalCredits;
    this.userId = props.userId;
    this.searchText = props.searchText;
    this.scheduleDescription = props.scheduleDescription;
    this.bachelorFolderFee = props.bachelorFolderFee;
    this.costs = props.costs;
    this.iaInformation = props.iaInformation;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(props: PartialProgramProps): Program {
    if (!props.name.trim()) {
      throw new DomainException('Program name cannot be empty');
    }
    if (!props.types.length) {
      throw new DomainException('Program must have at least one type');
    }
    return new Program({
      ...props,
      modalities: (props.modalities ?? []) as [ProgramModalityEntry, ...ProgramModalityEntry[]],
      iaInformation: props.iaInformation ?? '',
    });
  }

  isActive(): boolean {
    return this.status === 'active';
  }

  hasType(type: ProgramType): boolean {
    return (this.types as ProgramType[]).includes(type);
  }

  isVirtual(): boolean {
    return this.getFlatModalities().includes(Modality.VIRTUAL);
  }

  hasModality(modality: Modality): boolean {
    return this.getFlatModalities().includes(modality);
  }

  getFlatModalities(): Modality[] {
    const unique = new Set<Modality>();
    for (const entry of this.modalities) {
      for (const modality of entry.modalities) {
        unique.add(modality);
      }
    }
    return [...unique];
  }

  update(partial: Partial<Omit<ProgramProps, 'id' | 'createdAt'>>): Program {
    return Program.create({
      ...this.toProps(),
      ...partial,
      updatedAt: new Date(),
    });
  }

  toProps(): ProgramProps {
    return {
      id: this.id,
      name: this.name,
      types: this.types as [ProgramType, ...ProgramType[]],
      facultyId: this.facultyId,
      duration: this.duration,
      modalities: this.modalities as [ProgramModalityEntry, ...ProgramModalityEntry[]],
      academicDegree: this.academicDegree,
      professionalTitle: this.professionalTitle,
      brochureUrl: this.brochureUrl,
      summary: this.summary,
      sellingPoints: [...this.sellingPoints],
      tags: [...this.tags],
      questionsAnswered: [...this.questionsAnswered],
      faq: [...this.faq],
      graduateProfile: this.graduateProfile,
      jobOpportunities: [...this.jobOpportunities],
      objective: this.objective,
      coverImage: this.coverImage,
      gallery: [...this.gallery],
      promoVideoUrl: this.promoVideoUrl,
      admissionRequirements: [...this.admissionRequirements],
      whatsappContact: this.whatsappContact,
      applicationFormUrl: this.applicationFormUrl,
      thesisFolderFee: this.thesisFolderFee,
      slug: this.slug,
      status: this.status,
      directorId: this.directorId,
      teacherIds: [...this.teacherIds],
      totalCredits: this.totalCredits,
      userId: this.userId,
      searchText: this.searchText,
      scheduleDescription: this.scheduleDescription,
      bachelorFolderFee: this.bachelorFolderFee,
      costs: [...this.costs],
      iaInformation: this.iaInformation,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
