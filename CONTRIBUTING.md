# Contributing to Sansqrit

Thank you for contributing! All contributions are welcome.

## Rules

1. All PRs must include tests — no exceptions
2. Physics bugs require a failing test *before* the fix
3. Run `npm run test:all` — must show 71/71 passing
4. Keep commits small and focused

## Workflow

```bash
git clone https://github.com/YOUR-ORG/sansqrit.git
cd sansqrit
git checkout -b feature/my-contribution
# Make changes
npm run test:all        # must pass
git add -A
git commit -m "feat: description"
git push origin feature/my-contribution
# Open pull request on GitHub
```

## Adding a Block

Add to `src/blocks/registry.js` (or extra files):
```js
{ id:"my_block", label:"My Block", category:"Category / Sub",
  description:"What it does",
  params:[{name:"param",type:"number",default:0}],
  inputs:[{name:"register",type:"quantum"}],
  outputs:[{name:"register",type:"quantum"}] }
```

Add handler to `src/dsl/interpreter.js`:
```js
case 'my_block': return reg.myOperation(params.param);
```

Add test to `tests/test_dsl_advanced.js`.

## Contact

GitHub Issues or Discussions.
