import {
  sparqlEscapeUri,
  uuid,
} from "mu";

const HISTORY_CHANGE_GRAPH = process.env.HISTORY_CHANGE_GRAPH || "http://mu.semte.ch/graphs/history-changes";

const PREFIXES = `
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX session: <http://mu.semte.ch/vocabularies/session/>
PREFIX dct: <https://www.dublincore.org/specifications/dublin-core/dcmi-terms/#>
`;

export function getAccount(sessionGraphUri, sessionId) {
  return `
    ${PREFIXES}
    SELECT ?account
    WHERE {
      GRAPH ${sparqlEscapeUri(sessionGraphUri)} {
          ${sparqlEscapeUri(sessionId)} session:account ?account.
      }
    }

  `;
}

export function insertHistory(change) {
  const id = uuid();

  const historyUri = `<http://data.lblod.info/id/history/${id}>`;
  
  const insertions = change.insertions.map(insertion => {
    let insertId = uuid();
    return `
      ${historyUri} ext:historyInsert <http://data.lblod.info/id/history-insert/${insertId}>.
      <http://data.lblod.info/id/history-insert/${insertId}> a ext:HistoryInsert;
                                                       ext:subject ${insertion.subject};
                                                       ext:predicate ${insertion.predicate};
                                                       ext:object ${insertion.object}.

    `
  }).join("\n");

  const deletions = change.deletions.map(deletion => {
    let deleteId = uuid();
    return `
      ${historyUri} ext:historyDelete <http://data.lblod.info/id/history-delete/${deleteId}>.
      <http://data.lblod.info/id/history-delete/${deleteId}> a ext:HistoryDelete;
                                                       ext:subject ${deletion.subject};
                                                       ext:predicate ${deletion.predicate};
                                                       ext:object ${deletion.object}.

    `
  }).join("\n");

  
  const updates = change.updates.map(update => {
    let updateId = uuid();
    return `
      ${historyUri} ext:historyUpdate <http://data.lblod.info/id/history-update/${updateId}>.
      <http://data.lblod.info/id/history-update/${updateId}> a ext:HistoryUpdate;
                                                       ext:subject ${update.oldValue.subject};
                                                       ext:predicate ${update.oldValue.predicate};
                                                       ext:oldObject ${update.oldValue.object};
                                                       ext:newObject ${update.newValue.object}.

    `
  }).join("\n");

  return `
    ${PREFIXES}
    INSERT DATA {
      GRAPH <${HISTORY_CHANGE_GRAPH}> {
            ${historyUri} a ext:HistoryChange;
                          mu:uuid "${id}";
                          dct:created "${change.date.toISOString()}"^^xsd:dateTime;
                          session:account <${change.account}>.
            ${insertions}
            ${deletions}
            ${updates}

      }                                                     
    }
    
  `;


}
