import data from './library.json';

export interface LibraryWord { id: string; text: string; reading: string; meaning: string; topic: string }

/** The shared starter vocabulary every account receives once. */
export const LIBRARY: LibraryWord[] = data as LibraryWord[];
