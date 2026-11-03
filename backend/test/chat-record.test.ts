import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LlmClient } from '../src/chat.js';
import { chatRecorder } from '../src/chatRecord.js';
import { loadConfig } from '../src/config.js';
import type { ChatTurn } from '../src/contracts.js';
import { fromData } from '../src/menuKnowledge.js';
import { makeApp, testConfig } from './app-helpers.js';

// 팀장이 로컬 키오스크와 나눈 실사용 대화를 시험 데이터로 쌓는다 (2026-11-03). 기본 꺼짐, CHAT_RECORD_DIR이 있을 때만.
const knowledge = fromData([
  { id: 'dimsum-1', name: '모듬 딤섬', price: 19500, category: 'dimsum', kind: '딤섬', spicy: 0, servingPeople: 3, quantityUnit: '8개입', ingredients: [], ingredientsChecked: true, texture: [] },
]);
const fake = (answer: object): LlmClient => ({ model: 'fake', async generateJson() { return JSON.stringify(answer); } });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'menumate-chat-record-'));
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const lines = (dir: string) => fs.readFileSync(path.join(dir, `${today()}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const turns: ChatTurn[] = [{ role: 'assistant', text: '어서 오세요! 몇 분이서 오셨어요?' }, { role: 'user', text: '두 명이요' }];

describe('CHAT_RECORD_DIR: 실사용 대화 기록 (기본 꺼짐)', () => {
  it('값이 없으면 꺼져 있고(Render 기본), 있으면 backend/ 기준 경로로 읽는다', () => {
    const base = '/x/backend';
    expect(loadConfig({}, base).chatRecordDir).toBeNull();
    expect(loadConfig({ CHAT_RECORD_DIR: '  ' }, base).chatRecordDir).toBeNull();
    expect(loadConfig({ CHAT_RECORD_DIR: '../eval/live/raw' }, base).chatRecordDir).toBe(path.resolve('/x/eval/live/raw'));
    expect(chatRecorder(null)).toBeNull();
  });

  it('/api/chat 호출마다 <KST날짜>.jsonl에 한 줄: 대화·요청 조건·응답·걸린 시간만 (상황·키·IP 없음)', async () => {
    const dir = tmp();
    const app = await makeApp({ config: testConfig({ CHAT_RECORD_DIR: dir }), knowledge, llm: fake({ reply: '매운 음식도 잘 드시나요?', conditions: { party: 2 }, mood: 'neutral', picks: [], done: false, asking: 'spicy' }) });
    const r = await app.inject({ method: 'POST', url: '/api/chat', headers: { 'x-forwarded-for': '1.2.3.4' }, payload: { turns, conditions: { party: 1 }, context: { timeOfDay: 'lunch' } } });
    expect(r.statusCode).toBe(200);
    const [rec] = lines(dir);
    expect(rec).toMatchObject({ mode: 'live', turns, conditions: { party: 1 }, response: { reply: '매운 음식도 잘 드시나요?', asking: 'spicy', done: false, picks: [], pickReasons: [], heardSummary: '2명', partyAssumed: false, model: 'fake' } });
    expect(typeof rec.at).toBe('string');
    expect(typeof rec.ms).toBe('number');
    expect(Object.keys(rec).sort()).toEqual(['at', 'conditions', 'mode', 'ms', 'response', 'turns']);
    expect(Object.keys(rec.response).sort()).toEqual(['asking', 'conditions', 'done', 'heardSummary', 'model', 'partyAssumed', 'pickReasons', 'picks', 'reply']);
    expect(JSON.stringify(rec)).not.toContain('1.2.3.4');
    await app.close();
  });

  it('실패(CHAT_UNAVAILABLE)도 error로 기록하고, 응답은 그대로 503', async () => {
    const dir = tmp();
    const boom: LlmClient = { model: 'f', async generateJson() { throw new Error('quota'); } };
    const app = await makeApp({ config: testConfig({ CHAT_RECORD_DIR: dir }), knowledge, llm: boom });
    const r = await app.inject({ method: 'POST', url: '/api/chat', payload: { turns, conditions: {}, context: {} } });
    expect(r.statusCode).toBe(503);
    const [rec] = lines(dir);
    expect(rec).toMatchObject({ mode: 'live', turns, error: 'CHAT_UNAVAILABLE' });
    expect(rec).not.toHaveProperty('response');
    await app.close();
  });

  it('기록에 실패해도(폴더 자리에 파일이 있음) 응답은 막지 않는다', async () => {
    const file = path.join(tmp(), 'not-a-dir');
    fs.writeFileSync(file, 'x');
    const app = await makeApp({ config: testConfig({ CHAT_RECORD_DIR: file }), knowledge, llm: fake({ reply: '몇 분이세요?', conditions: {}, mood: null, picks: [], done: false, asking: 'party' }) });
    const r = await app.inject({ method: 'POST', url: '/api/chat', payload: { turns, conditions: {}, context: {} } });
    expect(r.statusCode).toBe(200);
    await app.close();
  });

  it('chatRecorder: 여러 번 부르면 줄이 쌓이고, 쓰기 실패는 던지지 않고 경고만(내용 없이)', async () => {
    const dir = tmp();
    const record = chatRecorder(dir)!;
    await record({ turns: [], conditions: {}, ms: 1 });
    await record({ turns, conditions: {}, error: 'CHAT_UNAVAILABLE', ms: 2 });
    expect(lines(dir).map((l) => l.ms)).toEqual([1, 2]);
    const warns: string[] = [];
    const file = path.join(tmp(), 'f');
    fs.writeFileSync(file, 'x');
    await expect(chatRecorder(file, { log: { warn: (m) => warns.push(m) } })!({ turns, conditions: {}, ms: 1 })).resolves.toBeUndefined();
    expect(warns).toHaveLength(1);
    expect(warns[0]).not.toContain('두 명이요');
  });
});
