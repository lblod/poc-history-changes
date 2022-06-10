# Poc history changes

## goal

- keep an history of who did what and when


## status
- for now it doesn't persist in the database but simply create a new file with the sparql query that would run in `data/<timestamp>.sparql`

## how to

- you need to use a specific version of mu-auth:  `semtech/mu-authorization:feature-share-mu-session-id-in-delta`
- you need to use a specific branch of delta notifier: https://github.com/nbittich/delta-notifier/tree/features/share-mu-session-id-in-delta

- add rule for delta:

```
  {
    match: {
      graph: {
        type: "uri",
        value: "http://mu.semte.ch/graphs/organisatieportaal"
      }
    },
    callback: {
      url: 'http://history/delta',
      method: 'POST'
    },
    options: {
      resourceFormat: "v0.0.1",
      gracePeriod: 10000,
      ignoreFromSelf: true
    }
  },
  ```

- use service:

```
   history:
    image: semtech/mu-javascript-template
    volumes:
      - <PATH_TO_THIS_REPO>:/app
      - <PATH_TO_THIS_REPO>/data:/data
    environment:
      NODE_ENV: "development"
      LOG_SPARQL_ALL: "false"
      DEBUG_AUTH_HEADERS: "false"
      AGGREGATION_INTERVAL: 5000
      HISTORY_CHANGE_GRAPH: "http://mu.semte.ch/graphs/history-changes"
    links:
      - db:database

```
