// Simple test to check if our migration works
import { each, map, without, reject, sortBy, defaults, mapObject } from './src/util/misc.js';

console.log('Testing migrated utility functions...');

// Test each
const testArray = [1, 2, 3];
const testObj = { a: 1, b: 2, c: 3 };

console.log('Testing each with array:');
each(testArray, (val, idx) => console.log(`  ${idx}: ${val}`));

console.log('Testing each with object:');
each(testObj, (val, key) => console.log(`  ${key}: ${val}`));

// Test map
console.log('Testing map:');
const doubled = map(testArray, x => x * 2);
console.log('  Doubled array:', doubled);

// Test without
console.log('Testing without:');
const filtered = without([1, 2, 3, 4, 2], 2);
console.log('  Without 2:', filtered);

// Test reject
console.log('Testing reject:');
const rejected = reject([1, 2, 3, 4], x => x % 2 === 0);
console.log('  Odd numbers only:', rejected);

// Test sortBy
console.log('Testing sortBy:');
const users = [{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }];
const sortedByAge = sortBy(users, 'age');
console.log('  Sorted by age:', sortedByAge);

// Test defaults
console.log('Testing defaults:');
const target = { a: 1 };
const result = defaults(target, { a: 2, b: 3 });
console.log('  Defaults result:', result);

// Test mapObject
console.log('Testing mapObject:');
const mapped = mapObject({ a: 1, b: 2 }, (val, key) => val * 2);
console.log('  Mapped object:', mapped);

console.log('Migration test completed successfully!');
