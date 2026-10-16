// Every query and mutation the screens use, in one place.
import { gql } from '@apollo/client';

export const APP_INFO = gql`
  query AppInfo {
    appInfo { hasApiKey spendLimitUsd writerModel graderModel }
  }
`;

export const LIBRARIES = gql`
  query Libraries {
    libraries {
      id name sourceUrl wayIn lastCheckedAt pageCount fileCount conceptCount solidCount failedPages
      job { id kind mode status message words pageCount estimateBatchUsd estimateDirectUsd costUsd }
      changes { pageId title kind questions bugs estimateUsd }
    }
  }
`;

export const CONCEPT_MAP = gql`
  query ConceptMap($libraryId: ID!) {
    conceptMap(libraryId: $libraryId) {
      libraryId nextId
      concepts { id name summary status docTitle docUrl needs quizState bugState activeExerciseDone exerciseKind fits questionCount }
      links { id firstId thenId }
    }
    dueReviews { id }
  }
`;

export const QUIZ = gql`
  query Quiz($conceptId: ID!) {
    concept(id: $conceptId) { id name bugState exerciseKind }
    quiz(conceptId: $conceptId) { id conceptId conceptName type prompt code options }
  }
`;

export const BUG = gql`
  query Bug($conceptId: ID!) {
    concept(id: $conceptId) { id name }
    bug(conceptId: $conceptId) { id conceptId conceptName description brokenCode runtime hints docTitle docUrl }
  }
`;

export const DUE_REVIEWS = gql`
  query DueReviews {
    dueReviews { id conceptId conceptName type prompt code options gapDays }
  }
`;

export const ANSWER = gql`
  mutation Answer($questionId: ID!, $answer: String!, $mode: AnswerMode!, $selfGrade: Boolean) {
    answerQuestion(questionId: $questionId, answer: $answer, mode: $mode, selfGrade: $selfGrade) {
      attemptId correct needsSelfGrade correctAnswer explanation feedback gapDays docTitle docUrl
    }
  }
`;

export const FINISH_QUIZ = gql`
  mutation FinishQuiz($conceptId: ID!, $attemptIds: [ID!]!) {
    finishQuiz(conceptId: $conceptId, attemptIds: $attemptIds) { passed right total passMark }
  }
`;

export const CHECK_BUG = gql`
  mutation CheckBug($bugId: ID!, $code: String!, $hintsUsed: Int!) {
    checkBugFix(bugId: $bugId, code: $code, hintsUsed: $hintsUsed) { ran solved timedOut error tests { name pass message } }
  }
`;

export const FLAG = gql`
  mutation Flag($kind: FlagKind!, $id: ID!) {
    flag(kind: $kind, id: $id)
  }
`;

export const START_IMPORT = gql`
  mutation StartImport($urls: [String!]!, $pageLimit: Int, $name: String, $files: [FileInput!]) {
    startImport(urls: $urls, pageLimit: $pageLimit, name: $name, files: $files) { id status }
  }
`;

export const ADD_FILES = gql`
  mutation AddFiles($libraryId: ID!, $files: [FileInput!]!) {
    addFiles(libraryId: $libraryId, files: $files) { message }
  }
`;

export const CONFIRM_IMPORT = gql`
  mutation ConfirmImport($jobId: ID!, $mode: ImportMode!) {
    confirmImport(jobId: $jobId, mode: $mode) { id status message }
  }
`;

export const CHECK_CHANGES = gql`
  mutation CheckChanges($libraryId: ID!) {
    checkForChanges(libraryId: $libraryId) { pageId title kind questions bugs }
  }
`;

export const APPROVE_UPDATE = gql`
  mutation ApproveUpdate($libraryId: ID!, $pageIds: [ID!]!) {
    approveUpdate(libraryId: $libraryId, pageIds: $pageIds) { id status }
  }
`;

export const TOP_UP = gql`
  mutation TopUp($conceptId: ID!, $what: TopUpKind!, $kind: ExerciseChoice) {
    topUp(conceptId: $conceptId, what: $what, kind: $kind) { added message }
  }
`;

export const EXPLAINER = gql`
  query Explainer($conceptId: ID!) {
    explainer(conceptId: $conceptId) { gist paragraphs example { code note } scenario watchOut terms { term meaning } }
  }
`;

export const WRITE_EXPLAINER = gql`
  mutation WriteExplainer($conceptId: ID!, $rewrite: Boolean) {
    writeExplainer(conceptId: $conceptId, rewrite: $rewrite) { gist paragraphs example { code note } scenario watchOut terms { term meaning } }
  }
`;

export const DELETE_LIBRARY = gql`
  mutation DeleteLibrary($id: ID!) {
    deleteLibrary(id: $id)
  }
`;

// The shapes the server sends back.
export interface Concept {
  id: string; name: string; summary: string; status: 'locked' | 'fresh' | 'learning' | 'solid';
  docTitle: string; docUrl: string; needs: string[]; quizState: 'none' | 'tried' | 'passed'; bugState: 'none' | 'open' | 'fixed'; activeExerciseDone: boolean; exerciseKind: 'code' | 'design' | 'apply' | 'order' | 'none'; fits: string[]; questionCount: number;
}
export interface Explainer { gist: string; paragraphs: string[]; example: { code: string; note: string } | null; scenario?: string | null; watchOut: string[]; terms: { term: string; meaning: string }[] }
export interface Link { id: string; firstId: string; thenId: string }
export interface Question { id: string; conceptId: string; conceptName: string; type: 'choice' | 'output' | 'written'; prompt: string; code: string; options: string[]; gapDays?: number | null }
export interface AnswerResult { attemptId: string | null; correct: boolean; needsSelfGrade: boolean; correctAnswer: string; explanation: string; feedback: string; gapDays: number; docTitle: string; docUrl: string }
export interface Job { id: string; kind: string; mode: string; status: string; message: string; words: number; pageCount: number; estimateBatchUsd: number; estimateDirectUsd: number; costUsd: number }
export interface Change { pageId: string; title: string; kind: string; questions: number; bugs: number; estimateUsd: number }
export interface Library { id: string; name: string; sourceUrl: string; wayIn: string; lastCheckedAt: string | null; pageCount: number; fileCount: number; conceptCount: number; solidCount: number; failedPages: string[]; job: Job | null; changes: Change[] }
export type PartKind = 'user' | 'service' | 'database' | 'queue' | 'topic' | 'cache' | 'loadBalancer' | 'gateway' | 'sessionStore' | 'function';
export type LinkStyle = 'call' | 'event';
export interface DesignPart { id: string; kind: PartKind; label: string }
export interface DesignLink { from: string; to: string; style: LinkStyle }
export interface Design { parts: DesignPart[]; links: DesignLink[] }
export interface PaletteItem { kind: PartKind; label: string }

export const DESIGN_FIX = gql`
  query DesignFix($conceptId: ID!) {
    concept(id: $conceptId) { id name }
    designFix(conceptId: $conceptId) {
      id conceptId conceptName scenario goals hints docTitle docUrl
      parts { id kind label } links { from to style } palette { kind label }
    }
  }
`;

export const CHECK_DESIGN = gql`
  mutation CheckDesign($designId: ID!, $design: String!, $hintsUsed: Int!) {
    checkDesign(designId: $designId, design: $design, hintsUsed: $hintsUsed) {
      solved
      checks { name pass message }
      solution { parts { id kind label } links { from to style } }
    }
  }
`;

export interface DesignFixData extends Design { id: string; conceptId: string; conceptName: string; scenario: string; goals: string[]; palette: PaletteItem[]; hints: string[]; docTitle: string; docUrl: string }
export interface DesignCheckResult { solved: boolean; checks: { name: string; pass: boolean; message: string }[]; solution: Design | null }

export const APPLY_IT = gql`
  query ApplyIt($conceptId: ID!) {
    concept(id: $conceptId) { id name }
    applyIt(conceptId: $conceptId) { id conceptId conceptName scenario task hints docTitle docUrl }
  }
`;

export const CHECK_APPLY = gql`
  mutation CheckApply($exerciseId: ID!, $answer: String!, $hintsUsed: Int!) {
    checkApply(exerciseId: $exerciseId, answer: $answer, hintsUsed: $hintsUsed) {
      solved covered needed summary modelAnswer
      points { text covered comment }
    }
  }
`;

export const ORDER_IT = gql`
  query OrderIt($conceptId: ID!) {
    concept(id: $conceptId) { id name }
    orderIt(conceptId: $conceptId) { id conceptId conceptName instruction steps { id text } hints docTitle docUrl }
  }
`;

export const CHECK_ORDER = gql`
  mutation CheckOrder($exerciseId: ID!, $order: [Int!]!, $hintsUsed: Int!) {
    checkOrder(exerciseId: $exerciseId, order: $order, hintsUsed: $hintsUsed) { solved placed correctCount total note }
  }
`;

export interface ApplyData { id: string; conceptId: string; conceptName: string; scenario: string; task: string; hints: string[]; docTitle: string; docUrl: string }
export interface ApplyResult { solved: boolean; covered: number; needed: number; summary: string; modelAnswer: string | null; points: { text: string; covered: boolean; comment: string }[] }
export interface OrderData { id: string; conceptId: string; conceptName: string; instruction: string; steps: { id: number; text: string }[]; hints: string[]; docTitle: string; docUrl: string }
export interface OrderResult { solved: boolean; placed: boolean[]; correctCount: number; total: number; note: string | null }
