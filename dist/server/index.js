//#endregion
//#region \0virtual:cloudflare/worker-entry
var worker_entry_default = { fetch(request, env) {
	return env.ASSETS.fetch(request);
} };
//#endregion
export { worker_entry_default as default };
