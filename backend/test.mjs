// Self-check for Code.gs rules against fake Apps Script services. Run: node backend/test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { makeFakeGas } = createRequire(import.meta.url)('./fake-gas.js');

const team = [{ name: 'Cam', email: 'cam@bagavagabonds.com' }, { name: 'Ann', email: 'ann@bagavagabonds.com' }, { name: 'Bo', email: 'bo@bagavagabonds.com' }];
const store = { Config: [['key', 'value'], ['team', JSON.stringify(team)], ['permissions', JSON.stringify({ 'bo@bagavagabonds.com': { canAssignOthers: false } })]] };
const tokens = { tCAM_xxxxxxxxxxxxxxxxxxxx: 'cam@bagavagabonds.com', tANN_xxxxxxxxxxxxxxxxxxxx: 'ann@bagavagabonds.com', tBO_xxxxxxxxxxxxxxxxxxxxx: 'bo@bagavagabonds.com', tOUT_xxxxxxxxxxxxxxxxxxxx: 'out@example.com' };
const gas = makeFakeGas(store, tokens);
const ctx = vm.createContext({ ...gas });
vm.runInContext(readFileSync(new URL('./Code.gs', import.meta.url), 'utf8'), ctx);
const call = (token, action, payload) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify({ token, action, payload }) } }).text);
const CAM = 'tCAM_xxxxxxxxxxxxxxxxxxxx', ANN = 'tANN_xxxxxxxxxxxxxxxxxxxx', BO = 'tBO_xxxxxxxxxxxxxxxxxxxxx', OUT = 'tOUT_xxxxxxxxxxxxxxxxxxxx';
const rows = () => (store.Tasks || []).slice(1).filter(r => r && r[0]);
const task = (id, extra = {}) => ({ id, title: 'T ' + id, priority: 'high', category: 'move', createdAt: 1, createdBy: 'Forged', createdByEmail: 'forged@x.com', ...extra });

// auth
assert.equal(call(undefined, 'load').code, 401);
assert.equal(call('nope_xxxxxxxxxxxxxxxxxxxxx', 'load').code, 401);
assert.equal(call(OUT, 'load').code, 403);
assert.equal(call(ANN, 'bogus').code, 400);
assert.deepEqual(call(ANN, 'team').data.map(m => m.name), ['Cam', 'Ann', 'Bo']);

// create: creator forced from token, assignee emailed, title can't inject headers
let r = call(ANN, 'saveTask', { task: task('task_1', { title: 'Hi\r\nBcc: evil@x.com', assignedTo: 'Bo', assignedToEmail: 'bo@bagavagabonds.com', points: 99 }) });
assert.equal(r.ok, true);
assert.equal(r.data.task.createdByEmail, 'ann@bagavagabonds.com');
assert.equal(r.data.task.points, null);
assert.equal(gas.mail.length, 1);
assert.equal(gas.mail[0].to, 'bo@bagavagabonds.com');
assert.ok(!/[\r\n]/.test(gas.mail[0].subject));
// outside assignee: saved, no email
call(ANN, 'saveTask', { task: task('task_2', { assignedToEmail: 'out@example.com' }) });
assert.equal(gas.mail.length, 1);
// retry of the same id is an update, not a duplicate row
call(ANN, 'saveTask', { task: task('task_1', { title: 'Hi again' }) });
assert.equal(rows().filter(x => x[0] === 'task_1').length, 1);
assert.equal(JSON.parse(rows().find(x => x[0] === 'task_1')[15]).createdByEmail, 'ann@bagavagabonds.com');

// permissions: Bo can't assign others, can assign himself
assert.equal(call(BO, 'saveTask', { task: task('task_3', { assignedToEmail: 'ann@bagavagabonds.com' }) }).code, 403);
assert.equal(call(BO, 'saveTask', { task: task('task_3', { assignedToEmail: 'bo@bagavagabonds.com' }) }).ok, true);
store.Config[2][1] = JSON.stringify({ 'bo@bagavagabonds.com': { canCreate: false } });
assert.equal(call(BO, 'saveTask', { task: task('task_4') }).code, 403);

// complete by Bo: points recomputed (forged 99 ignored), creator Ann emailed
r = call(BO, 'saveTask', { task: task('task_1', { acceptedAt: 2, completedAt: 3, duration: 1000, points: 99 }) });
assert.equal(r.data.task.points, 4);
assert.equal(gas.mail.at(-1).to, 'ann@bagavagabonds.com');
assert.match(gas.mail.at(-1).body, /Completed by: Bo/);
// done task: crew can only add comments
r = call(BO, 'saveTask', { task: task('task_1', { completedAt: 3, points: 50, title: 'changed', comments: [{ id: 'c1', text: 'nice', createdAt: 5 }] }) });
assert.equal(r.data.task.points, 4);
assert.equal(r.data.task.title, 'T task_1');
assert.equal(r.data.task.comments.length, 1);
// admin can fix points/assignee on done tasks
assert.equal(call(CAM, 'saveTask', { task: { ...r.data.task, assignedTo: 'Ann', points: 5 } }).data.task.points, 5);

// delete: any crew, row cleared, tombstoned, later saves skipped
r = call(BO, 'deleteTasks', { ids: ['task_2'] });
assert.deepEqual(r.data.deletedIds, ['task_2']);
assert.ok(!rows().some(x => x[0] === 'task_2'));
assert.equal(call(ANN, 'saveTask', { task: task('task_2') }).data.skipped, 'deleted');

// config
assert.equal(call(ANN, 'setConfig', { key: 'permissions', value: {} }).code, 403);
assert.equal(call(ANN, 'setConfig', { key: 'team', value: [] }).code, 403);
assert.equal(call(ANN, 'setConfig', { key: 'deletedIds', value: [] }).code, 400);
assert.equal(call(ANN, 'setConfig', { key: 'clients', value: ['General / Internal', 'Acme'] }).ok, true);
assert.deepEqual(call(ANN, 'load').data.config.clients, ['General / Internal', 'Acme']);
assert.equal(call(CAM, 'setConfig', { key: 'hours', value: { mon: '9-3' } }).ok, true);

// rewrite: admin only, makes a backup tab
assert.equal(call(ANN, 'rewrite').code, 403);
r = call(CAM, 'rewrite');
assert.equal(r.ok, true, r.error);
assert.ok(store[r.data.backup]);
assert.equal(rows().length, 2);

// audit trail
assert.ok(store.Audit.length > 5);
console.log('backend ok:', store.Audit.length - 1, 'audited writes,', gas.mail.length, 'emails');
