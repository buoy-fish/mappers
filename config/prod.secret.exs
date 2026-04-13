# In this file, we load production configuration and secrets
# from environment variables. You can also hardcode secrets,
# although such is generally not recommended and you have to
# remember to add this file to your .gitignore.
import Config

# Database configuration.
# If DATABASE_URL is set, use it (for remote/password-auth connections).
# Otherwise, use local PostgreSQL via unix socket with peer auth (no password needed).
if database_url = System.get_env("DATABASE_URL") do
  config :mappers, Mappers.Repo,
    ssl: false,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")
else
  config :mappers, Mappers.Repo,
    ssl: false,
    username: System.get_env("DB_USER") || "ubuntu",
    database: System.get_env("DB_NAME") || "buoy_mappers",
    socket_dir: System.get_env("DB_SOCKET_DIR") || "/var/run/postgresql",
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")
end

secret_key_base =
  System.get_env("SECRET_KEY_BASE") ||
    raise """
    environment variable SECRET_KEY_BASE is missing.
    You can generate one by calling: mix phx.gen.secret
    """

config :mappers, MappersWeb.Endpoint,
  http: [
    port: String.to_integer(System.get_env("PORT") || "4000"),
    transport_options: [socket_opts: [:inet6]]
  ],
  secret_key_base: secret_key_base

# Admin API shared-secret token. Used by MappersWeb.Plug.AdminAuth to guard
# the /api/v1/admin/* routes (e.g. coverage purge). Must be set in production.
config :mappers, :admin_token, System.get_env("MAPPERS_ADMIN_TOKEN")

# ## Using releases (Elixir v1.9+)
#
# If you are doing OTP releases, you need to instruct Phoenix
# to start each relevant endpoint:
#
#     config :mappers, MappersWeb.Endpoint, server: true
#
# Then you can assemble a release by calling `mix release`.
# See `mix help release` for more information.
