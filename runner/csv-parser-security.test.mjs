import assert from 'node:assert/strict';
import test from 'node:test';
import {parse} from 'csv-parse';
import {parse as parseSync} from 'csv-parse/sync';

const hostile='__proto__,__proto__,constructor,name\nfirst,second,third,Example Center\n';
function assertSafe(rows){
  assert.equal(rows.length,1);
  const row=rows[0];
  assert.equal(Object.getPrototypeOf(row),Object.prototype);
  assert.equal(Object.hasOwn(row,'__proto__'),true);
  assert.deepEqual(row.__proto__,['first','second']);
  assert.equal(Object.hasOwn(row,'constructor'),true);
  assert.equal(row.constructor,'third');
  assert.equal(row.name,'Example Center');
  assert.equal(Object.prototype.first,undefined);
}

test('CSV sync and streaming duplicate hostile headers remain own data properties',async()=>{
  const options={columns:true,group_columns_by_name:true};
  assertSafe(parseSync(hostile,options));
  const parser=parse(options),rows=[];
  parser.end(hostile);
  for await(const row of parser)rows.push(row);
  assertSafe(rows);
});

test('CSV parser upgrade preserves quoted newlines, separate postal text and strict malformed-input errors',async()=>{
  const text='name,zip5,zip4\r\n"Example,\nCenter",00100,0123\r\n';
  const expected=[{name:'Example,\nCenter',zip5:'00100',zip4:'0123'}];
  assert.deepEqual(parseSync(text,{columns:true}),expected);
  const rows=await new Promise((resolve,reject)=>parse(text,{columns:true},(error,result)=>error?reject(error):resolve(result)));
  assert.deepEqual(rows,expected);
  assert.throws(()=>parseSync('name\n"unclosed',{columns:true}),{code:'CSV_QUOTE_NOT_CLOSED'});
});
