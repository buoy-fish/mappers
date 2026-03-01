I need to determine why mapping payloads from my Adeunis FTD are not being accepted by the Helium Mappers API. 
I've set up a node-RED Instance and captured the payloads being sent:
payloads from node-RED
    ```
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "MENEFkAGVQNxOQ==",
        "deduplicationId": "61bf0a6e-a131-45e7-bb67-fb94a38c95c2",
        "devAddr": "78000190",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #1 Panga Mapper (2C95)",
            "devEui": "0018b20000022c95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 0,
        "fCnt": 182,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 41855,
                "gwTime": "2025-10-10T12:59:37.183+00:00",
                "rssi": -36,
                "snr": 12,
                "context": "D3dpiQ==",
                "metadata": {
                    "network": "helium_iot",
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "regi": "US915",
                    "gateway_name": "damp-magenta-turtle"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T12:59:37.183+00:00"
            }
        ],
        "time": "2025-10-10T12:59:37.183+00:00",
        "txInfo": {
            "frequency": 905100000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 10,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "EENEFiAGVQNxOA==",
        "deduplicationId": "8c334c01-97c6-46ff-b88e-2fe2d389dbdc",
        "devAddr": "78000190",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #1 Panga Mapper (2C95)",
            "devEui": "0018b20000022c95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 3,
        "fCnt": 184,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 39342,
                "gwTime": "2025-10-10T13:07:33.534+00:00",
                "rssi": -49,
                "snr": 13.2,
                "context": "K9v87w==",
                "metadata": {
                    "network": "helium_iot",
                    "regi": "US915",
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "gateway_name": "damp-magenta-turtle"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:07:33.534+00:00"
            }
        ],
        "time": "2025-10-10T13:07:33.534+00:00",
        "txInfo": {
            "frequency": 904500000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 7,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "EENEFmAGVQNxNg==",
        "deduplicationId": "3d34ea70-3ccb-42b1-8a97-e4e8848a145a",
        "devAddr": "78000192",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #3 Panga Mapper (0E95)",
            "devEui": "0018b20000020e95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 0,
        "fCnt": 162,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 62716,
                "gwTime": "2025-10-10T13:09:21.532+00:00",
                "rssi": -39,
                "snr": 10.8,
                "context": "Mkv83Q==",
                "metadata": {
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "gateway_name": "damp-magenta-turtle",
                    "regi": "US915",
                    "network": "helium_iot"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:09:21.532+00:00"
            }
        ],
        "time": "2025-10-10T13:09:21.532+00:00",
        "txInfo": {
            "frequency": 904900000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 10,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "MENEFkAGVQNxNA==",
        "deduplicationId": "1b7686f6-9518-43b4-a404-209bb19874ff",
        "devAddr": "78000190",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #1 Panga Mapper (2C95)",
            "devEui": "0018b20000022c95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 3,
        "fCnt": 186,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 19651,
                "gwTime": "2025-10-10T13:12:14.578+00:00",
                "rssi": -37,
                "snr": 13.8,
                "context": "PJxrcw==",
                "metadata": {
                    "network": "helium_iot",
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "regi": "US915",
                    "gateway_name": "damp-magenta-turtle"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:12:14.578+00:00"
            }
        ],
        "time": "2025-10-10T13:12:14.578+00:00",
        "txInfo": {
            "frequency": 905300000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 7,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "EENEFjAGVQNxOA==",
        "deduplicationId": "19536253-bb3e-4d23-a10f-8e9e7f524bb9",
        "devAddr": "78000190",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #1 Panga Mapper (2C95)",
            "devEui": "0018b20000022c95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 3,
        "fCnt": 188,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 2171,
                "gwTime": "2025-10-10T13:17:33.482+00:00",
                "rssi": -46,
                "snr": 13.2,
                "context": "T56Jog==",
                "metadata": {
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "regi": "US915",
                    "gateway_name": "damp-magenta-turtle",
                    "network": "helium_iot"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:17:33.482+00:00"
            }
        ],
        "time": "2025-10-10T13:17:33.482+00:00",
        "txInfo": {
            "frequency": 904900000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 7,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "EENEFhAGVQNxNw==",
        "deduplicationId": "2793ad13-931e-41dc-8b97-0df2c4ca95c8",
        "devAddr": "78000192",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #3 Panga Mapper (0E95)",
            "devEui": "0018b20000020e95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 0,
        "fCnt": 164,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 17647,
                "gwTime": "2025-10-10T13:19:14.497+00:00",
                "rssi": -39,
                "snr": 11.2,
                "context": "VaPZqw==",
                "metadata": {
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "regi": "US915",
                    "network": "helium_iot",
                    "gateway_name": "damp-magenta-turtle"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:19:14.497+00:00"
            }
        ],
        "time": "2025-10-10T13:19:14.497+00:00",
        "txInfo": {
            "frequency": 904100000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 10,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "EENEFjAGVQNxNg==",
        "deduplicationId": "26dad3ad-9fcc-4103-acb3-af2477153219",
        "devAddr": "78000190",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #1 Panga Mapper (2C95)",
            "devEui": "0018b20000022c95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 3,
        "fCnt": 190,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 62212,
                "gwTime": "2025-10-10T13:27:33.441+00:00",
                "rssi": -50,
                "snr": 13.5,
                "context": "c2E5QQ==",
                "metadata": {
                    "gateway_name": "damp-magenta-turtle",
                    "network": "helium_iot",
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "regi": "US915"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:27:33.441+00:00"
            }
        ],
        "time": "2025-10-10T13:27:33.441+00:00",
        "txInfo": {
            "frequency": 904700000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 7,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "EENEFjAGVQNxNw==",
        "deduplicationId": "601f5f15-7d7d-4fc1-8736-eb9762b6a043",
        "devAddr": "78000192",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #3 Panga Mapper (0E95)",
            "devEui": "0018b20000020e95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 3,
        "fCnt": 166,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 31948,
                "gwTime": "2025-10-10T13:29:06.165+00:00",
                "rssi": -43,
                "snr": 13,
                "context": "eOgLpw==",
                "metadata": {
                    "network": "helium_iot",
                    "regi": "US915",
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "gateway_name": "damp-magenta-turtle"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:29:06.165+00:00"
            }
        ],
        "time": "2025-10-10T13:29:06.165+00:00",
        "txInfo": {
            "frequency": 904500000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 7,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    {
        "object": {
            "latitude": 43.736,
            "longitude": -65.8395,
            "accuracy": 8,
            "altitude": 2
        },
        "adr": true,
        "confirmed": true,
        "data": "EENEFiAGVQNxOA==",
        "deduplicationId": "127fb4b4-8e24-4c65-b7a4-fdb4bccce049",
        "devAddr": "78000190",
        "deviceInfo": {
            "tenantId": "e1d293fb-6dc5-4214-a23a-94696f17f82f",
            "tenantName": "buoy",
            "applicationId": "e12063f6-8fcb-4fc6-8045-41cb880ce55c",
            "applicationName": "Adeunis FTD Mappers",
            "deviceProfileId": "5aafaf97-e079-469e-ae07-0a121ca14ff2",
            "deviceProfileName": "Adeunis Panga Mappers",
            "deviceName": "Adeunis #1 Panga Mapper (2C95)",
            "devEui": "0018b20000022c95",
            "deviceClassEnabled": "CLASS_A",
            "tags": {}
        },
        "dr": 3,
        "fCnt": 192,
        "fPort": 1,
        "rxInfo": [
            {
                "gatewayId": "acd9b11959a44ab3",
                "uplinkId": 565,
                "gwTime": "2025-10-10T13:37:33.403+00:00",
                "rssi": -44,
                "snr": 10.2,
                "context": "lyPONg==",
                "metadata": {
                    "network": "helium_iot",
                    "gateway_id": "13H54UfBmgVcLujko4ZUo3UiAspkEvv2fzS4bLDtjPyT5ecPfXJ",
                    "regi": "US915",
                    "gateway_name": "damp-magenta-turtle"
                },
                "crcStatus": "CRC_OK",
                "time": "2025-10-10T13:37:33.403+00:00"
            }
        ],
        "time": "2025-10-10T13:37:33.403+00:00",
        "txInfo": {
            "frequency": 904300000,
            "modulation": {
                "lora": {
                    "bandwidth": 125000,
                    "spreadingFactor": 7,
                    "codeRate": "CR_4_5"
                }
            }
        }
    }
    ```

I think they're getting rejected by the mappers API, so I forked this and it's here in this repo. If I'm not able to use the public mappers API, we'll need to set up our own front end visualization based on this repo. But first I'd like to determine why payloads are getting rejected. 

I think it may have to do with the name of the hotspots. I can see that payloads are getting carried by hotspot names that are different from the ones I've asserted. 

Below are the hotspots I've asserted. Right now I'm next to cool-orange-crane, but I don't see this name in the node-RED logs. I see damp-magenta-turtle. 

Hotspots for this project can be found with ``hw-novascotia hotspots list``
{
  "address": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN",
  "hotspots": [
    {
      "asset": "HRtS4y4z5PCWym3tc94UxbaHKFfiAGoZkz1BrYCbYpJh",
      "key": "14R9Hz1yKs4UQsjBkobfhVQPr3mxQkaWHZBnsnCrKQWVBaictmt",
      "name": "square-navy-urchin",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    },
    {
      "asset": "GW6FHsNpF14VtJCDR4X77VE7Kwen9fd3vc15LThK1k5z",
      "key": "139se7yQmSeNoWus68HjhNf2XkUgRk4u7DBqU6Vra2WaA4U4QcW",
      "name": "formal-rainbow-finch",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    },
    {
      "asset": "FzAvoXsnGV6Bn7kTRXXM4eVrHHpme1eDbMH5pMi7zaFy",
      "key": "14SRPDUNqvpLoeXpZAHCaPzMjjiCNTEtYnMpoCcYZ3rSbkrQHXB",
      "name": "powerful-ruby-hippo",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    },
    {
      "asset": "DSU2p9GbRkXFYxb3rmQECuRDwkSStpBkCnK2TMNLhZDJ",
      "key": "14ThnjhssEZxEp4azov1oRb5yR2vpNvEtWhVkqtFVuovE1TGjbh",
      "name": "old-glossy-llama",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    },
    {
      "asset": "CAfzMHDCSJ63iEfrXJ8VKzC7Kxn7jMQyaPEx3XmpHSjt",
      "key": "137JTGvmJLxTyzEg7FKVci6nvSSiE23TTJu6er8S1KrFFEUUoFj",
      "name": "cool-orange-crane",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    },
    {
      "asset": "ADfqM2JGRhK1zB3HQs3LiR8SzwzQSL59dBCSNfy2ihn1",
      "key": "13RzkRUC81RZ8yuMGYUytPCsAvYRznekZUE6zjNU7Ly1GYSuZyz",
      "name": "large-plum-piranha",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    },
    {
      "asset": "45egbjTqkaHLfv35XSYbME7iJjtFdK49AEZ4wQQjx5oU",
      "key": "11TKL1YR2BeVAe4r9NoDsAAmTbQGkkuyWiXW6FbQ1hTvH251S1a",
      "name": "steep-ivory-koala",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    },
    {
      "asset": "31vuUtuveJQt5nPCNFRvGUbNDFJxqfmkUeQwueZ6eEQ6",
      "key": "13CXuZnpykMv3pa6EEbK4iPpkRSybuCtSbpqwbH7moSLPR3xvbC",
      "name": "dizzy-berry-python",
      "owner": "BBDEufJuJEauNJHHoJdzJqnm1Z3VsDfR62Bs8enQzcpN"
    }
  ]
}

Can you help me get to the bottom of this? 