interface Env {
  ASSETS: Fetcher;
}

const worker = {
  fetch(request: Request, env: Env) {
    return env.ASSETS.fetch(request);
  },
};

export default worker;
