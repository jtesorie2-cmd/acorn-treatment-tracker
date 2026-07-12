// The HTML (and generated card markup) uses inline onclick="..." handlers,
// which resolve against window. ES module functions aren't global, so each
// feature module explicitly publishes its handlers here.
export function expose(fns) {
  for (const [name, fn] of Object.entries(fns)) window[name] = fn;
}
