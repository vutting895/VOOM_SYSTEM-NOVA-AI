export default {
  async fetch() {
    return new Response(
      JSON.stringify({
        service: "nova-ci-runner",
        status: "ready",
        purpose: "build-validation-only",
        productDeploymentsEnabled: false,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  },
};
