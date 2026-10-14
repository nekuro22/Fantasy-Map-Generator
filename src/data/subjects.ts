// Kinds of subject states: what a vassal is to its overlord, and the names such states go by

export interface SubjectType {
  tip: string;
  /** form names the subject takes; none keeps its own */
  names: string[];
  /** how often an overlord of each form of government makes this kind of subject */
  weights: Partial<Record<string, number>>;
  /** only for subjects of this form of government */
  subjectForm?: string;
}

export const SUBJECT_TYPES: Record<string, SubjectType> = {
  Vassal: {
    tip: "Feudal subject: owes its overlord troops and taxes, rules itself otherwise",
    names: ["Marches", "Duchy", "Principality"],
    weights: { Monarchy: 5, Theocracy: 2 }
  },
  Dominion: {
    tip: "Self-governing realm of the overlord's crown, nearly independent",
    names: ["Dominion"],
    weights: { Monarchy: 2, Union: 2 }
  },
  "Personal Union": {
    tip: "Shares its monarch with the overlord but keeps its own laws and institutions",
    names: [],
    weights: { Monarchy: 1 },
    subjectForm: "Monarchy"
  },
  Tributary: {
    tip: "Pays tribute and acknowledges the overlord's supremacy, free in all else",
    names: [],
    weights: { Monarchy: 2, Theocracy: 2, Anarchy: 1 }
  },
  Protectorate: {
    tip: "Keeps its own government; the overlord runs its defence and foreign policy",
    names: ["Protectorate"],
    weights: { Monarchy: 1, Republic: 3, Union: 2, Theocracy: 1 }
  },
  Puppet: {
    tip: "Ruled by a government the overlord installed and controls",
    names: [],
    weights: { Monarchy: 1, Republic: 2, Union: 1, Socialist: 1, Anarchy: 1 }
  },
  Satellite: {
    tip: "Formally independent people's state that follows the line of its socialist overlord",
    names: ["People's Republic", "People's Democratic Republic", "Socialist Republic"],
    weights: { Socialist: 4 }
  },
  "Union Republic": {
    tip: "Constituent republic of a socialist union, with the right to secede on paper only",
    names: ["Soviet Socialist Republic", "Autonomous Soviet Socialist Republic"],
    weights: { Socialist: 2 }
  },
  "Supervised State": {
    tip: "Run by the overlord's commissioners or military administration",
    names: ["Reichskommissariat", "Military Administration", "Governorate"],
    weights: { Monarchy: 0.5, Republic: 1, Socialist: 1 }
  },
  Mandate: {
    tip: "Administered by the overlord until it is deemed ready for independence",
    names: ["Mandate"],
    weights: { Republic: 2, Union: 1 }
  },
  Colony: {
    tip: "Overseas possession governed for the benefit of the overlord",
    names: ["Colony", "Crown Colony"],
    weights: { Monarchy: 1, Republic: 1, Union: 1 }
  },
  "Associated State": {
    tip: "Freely associated with the overlord, which handles its defence",
    names: ["Associated State", "Free State", "Commonwealth"],
    weights: { Republic: 2, Union: 2 }
  },
  "Ecclesiastical Fief": {
    tip: "Land ruled by a prince of the church in the name of the overlord's faith",
    names: ["Prince-Bishopric", "Prelature"],
    weights: { Theocracy: 3 }
  }
};

export const isSubjectType = (value: string): boolean => Object.hasOwn(SUBJECT_TYPES, value);
