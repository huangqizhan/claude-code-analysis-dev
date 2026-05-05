/**
 * 演示 loader 里 isRecord 的两件事：运行时判断 + 类型收窄
 * 运行：npx tsx examples/is-record-demo.ts
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// --- 1) 运行时：真在判断，打印 true / false ---
const samples: unknown[] = [null, 1, 'hi', {}, [], new Date()];

console.log('--- 运行时 return 的结果 ---');
for (const s of samples) {
  console.log(`${JSON.stringify(s)}  ->  isRecord = ${isRecord(s)}`);
}

// --- 2) 类型：进 if 后，TS 把 unknown 收窄成「可按字符串键读」的对象 ---
function readName(data: unknown): unknown {
  if (isRecord(data)) {
    // 若把上面改成 `: boolean`，这里会报错：data 仍是 unknown
    return data['name'];
  }
  return undefined;
}

console.log('\n--- 收窄后读 key ---');
console.log('readName({ name: "skill" }) =', readName({ name: 'skill' }));
console.log('readName("oops")         =', readName('oops'));
