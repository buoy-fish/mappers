import Config

# Configure your database
#
# The MIX_TEST_PARTITION environment variable can be used
# to provide built-in test partitioning in CI environment.
# Run `mix help test` for more information.
config :mappers, Mappers.Repo,
  username: "postgres",
  password: "postgres",
  database: "mappers_test#{System.get_env("MIX_TEST_PARTITION")}",
  hostname: "localhost",
  pool: Ecto.Adapters.SQL.Sandbox

# We don't run a server during test. If one is required,
# you can enable the server option below.
config :mappers, MappersWeb.Endpoint,
  http: [port: 4002],
  server: false

# Print only warnings and errors during test
config :logger, level: :warning

# Never let the inventory poller hit the network from tests; individual tests
# drive Mappers.Test.StubInventoryClient via :inventory_stub_response. The huge
# refresh interval keeps the boot-time supervised poller from firing mid-test.
config :mappers,
  inventory_http_client: Mappers.Test.StubInventoryClient,
  inventory_refresh_ms: 3_600_000
