jt@Jamesons-MacBook-Pro-2 ~ % hw-novascotia hotspots update --help
Assert a Hotspot location on the blockchain.

The original transaction is created by the Hotspot miner and supplied here for owner signing. Use an onboarding key to get the transaction signed by the DeWi staking server.

Usage: helium-wallet hotspots update [OPTIONS] <SUBDAO> <GATEWAY>

Arguments:
  <SUBDAO>
          The subdao to assert the Hotspot on
          
          [possible values: iot, mobile]

  <GATEWAY>
          Helium address of Hotspot to assert

Options:
      --lat <LAT>
          Latitude of Hotspot location to assert.
          
          Defaults to the last asserted value. For negative values use '=', for example: "--lat=-xx.xxxxxxx".

      --lon <LON>
          Longitude of Hotspot location to assert.
          
          Defaults to the last asserted value. For negative values use '=', for example: "--lon=-xx.xxxxxxx".

      --gain <GAIN>
          The antenna gain for the asserted Hotspot in dBi, with one digit of accuracy.
          
          Defaults to the last asserted value. Note that the gain is truncated to the nearest 0.1 dBi.

      --elevation <ELEVATION>
          The elevation for the asserted Hotspot in meters above ground level.
          
          Defaults to the last assserted value. For negative values use '=', for example: "--elevation=-xx".

      --onboarding <ONBOARDING>
          The onboarding server to use for asserting the hotspot.
          
          If the API URL is specified with a shortcut like "m" or "d", the default onboarding server for that network will be used.

      --skip-preflight
          Skip pre-flight

      --min-priority-fee <MIN_PRIORITY_FEE>
          Minimum priority fee in micro lamports
          
          [default: 1]

      --max-priority-fee <MAX_PRIORITY_FEE>
          Maximum priority fee in micro lamports
          
          [default: 2500000]

      --commit
          Commit the transaction

  -h, --help
          Print help (see a summary with '-h')