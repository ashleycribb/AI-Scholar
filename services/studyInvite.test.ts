import { describe, expect, test } from 'bun:test';
import { captureStudyInviteOnLoad, readStudyInviteId } from './studyInvite';

describe('readStudyInviteId', () => {
  test('reads studyId and study, trims, and returns null otherwise', () => {
    expect(readStudyInviteId('?studyId=STUDY-1')).toBe('STUDY-1');
    expect(readStudyInviteId('?study=%20STUDY-2%20')).toBe('STUDY-2');
    expect(readStudyInviteId('?studyId=A&study=B')).toBe('A');
    expect(readStudyInviteId('')).toBeNull();
    expect(readStudyInviteId('?q=x')).toBeNull();
    expect(readStudyInviteId('?studyId=')).toBeNull();
    expect(readStudyInviteId('?studyId=%20%20')).toBeNull();
  });

  test('rejects overlong ids and control characters', () => {
    expect(readStudyInviteId('?studyId=' + 'a'.repeat(129))).toBeNull();
    expect(readStudyInviteId('?studyId=a%00b')).toBeNull();
    expect(readStudyInviteId('?studyId=a%0Ab')).toBeNull();
  });
});

describe('captureStudyInviteOnLoad', () => {
  test('without an invite it calls nothing', () => {
    const seen: string[] = [];
    expect(captureStudyInviteOnLoad('', (id) => seen.push(id))).toBeNull();
    expect(seen).toEqual([]);
  });

  test('with an invite it only hands the id to the single callback', () => {
    const seen: string[] = [];
    expect(captureStudyInviteOnLoad('?studyId=STUDY-9', (id) => seen.push(id))).toBe('STUDY-9');
    expect(seen).toEqual(['STUDY-9']);
  });
});
