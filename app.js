import { app } from "mu";
import { querySudo, updateSudo } from "@lblod/mu-auth-sudo";
import bodyParser from "body-parser";
import {
  getAccount,
  accountDetail,
  insertHistory,
  getDeletes,
  getUpdates,
  getInserts,
  getAllHistoryChange,
} from "./queries";
import Triple from "./triple";

const SESSION_GRAPH_URI =
  process.env.SESSION_GRAPH || "http://mu.semte.ch/graphs/sessions";
const AGGREGATION_INTERVAL = process.env.AGGREGATION_INTERVAL || 15_000;

const STORE = new Map();

app.use(
  bodyParser.json({
    type: function (req) {
      return /^application\/json/.test(req.get("content-type"));
    },
  })
);

app.get("/history-changes", async (req, res, next) => {
  const changes = await getAllHistoryChanges();
  return res.json(changes);
});

app.get("/history-changes/:id", async (req, res, next) => {
  const details = await getHistoryDetail(req.params.id);
  return res.json(details);
});

app.post("/delta", async (req, res, next) => {
  try {
    const sessionId = req.get("mu-session-id");
    const account = await getAccountBySession(sessionId);
    checkNotEmpty(account, "No account found!");

    let changeSet = req.body.reduce(
      (prev, curr) => {
        return {
          inserts: [
            ...prev.inserts,
            ...curr.inserts.map((i) => new Triple(i)),
          ].flat(),
          deletes: [
            ...prev.deletes,
            ...curr.deletes.map((d) => new Triple(d)),
          ].flat(),
        };
      },
      { inserts: [], deletes: [] }
    );

    const inserts = [...changeSet.inserts];
    const deletes = [...changeSet.deletes];

    changeSet.inserts = changeSet.inserts.filter(
      (i) => !deletes.some((d) => d.isEqual(i))
    );

    changeSet.deletes = changeSet.deletes.filter(
      (d) => !inserts.some((i) => i.isEqual(d))
    );

    // filter if no changes
    if (changeSet.inserts.length || changeSet.deletes.length) {
      if (!STORE.has(account)) {
        STORE.set(account, {
          date: new Date(),
          account: account,
          deltas: [changeSet],
        });
      } else {
        STORE.get(account).deltas.push(changeSet);
      }
    }

    return res.status(200).send().end();
  } catch (e) {
    return next(e);
  }
});

function error(res, message, status = 400) {
  return res.status(status).json({ errors: [{ title: message }] });
}

app.use(error);

// #region aggregates
setInterval(async () => {
  let now = new Date();
  const sink = [...STORE].filter(
    ([k, v]) => now.getTime() - v.date.getTime() >= AGGREGATION_INTERVAL
  );
  
  for (const [k, change] of sink) {
    STORE.delete(k);
    const inserts = change.deltas.map((d) => d.inserts).flat();
    const deletes = change.deltas.map((d) => d.deletes).flat();

    const deletions = deletes.filter(
      (d) =>
        !inserts.some(
          (i) => i.predicate === d.predicate && d.subject === i.subject
        )
    ); // deletes without insert back
    const insertions = inserts.filter(
      (i) =>
        !deletes.some(
          (d) => i.predicate === d.predicate && d.subject === i.subject
        )
    ); // insert without deletes

    const newValues = inserts.filter((i) => !insertions.includes(i));
    const oldValues = deletes.filter((d) => !deletions.includes(d));

    const updates = newValues.map((i) => {
      return {
        oldValue: oldValues
          .find((d) => d.predicate === i.predicate && d.subject === i.subject)
          .toNTriple(),
        newValue: i.toNTriple(),
      };
    });

    await updateSudo(
      insertHistory({
        date: change.date,
        account: change.account,
        insertions: insertions.map((i) => i.toNTriple()),
        deletions: deletions.map((d) => d.toNTriple()),
        updates,
      })
    );

  }
}, 1000);

// #endregion

// #region function

async function getAccountBySession(sessionId) {
  checkNotEmpty(sessionId, "No session id!");
  let getAccountQuery = getAccount(SESSION_GRAPH_URI, sessionId);
  const queryResult = await querySudo(getAccountQuery);
  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return result.account?.value;
  } else {
    return null;
  }
}

function checkNotEmpty(argument, message = "This cannont be empty!") {
  if (!argument?.length) {
    throw Error(message);
  }
}
export async function selectUserByAccount(accountUri) {
  const queryResult = await querySudo(accountDetail(accountUri));

  if (queryResult.results.bindings.length) {
    const result = queryResult.results.bindings[0];
    return {
      accountUri: accountUri,
      accountIdentifier: result.accountIdentifier?.value,
      accountProvider: result.accountProvider.value,
      userFirstname: result.userFirstname.value,
      userFamilyName: result.userFamilyName.value,
      userId: result.userId.value,
      accountId: result.accountId.value,
    };
  } else {
    return {
      accountUri: null,
      accountIdentifier: null,
      accountProvider: null,
      userFirstname: null,
      userFamilyName: null,
      userId: null,
      accountId: null,
    };
  }
}
export async function getAllHistoryChanges() {
  const queryResult = await querySudo(getAllHistoryChange());

  const results = [];
  for (const result of queryResult.results.bindings) {
    const accountUri = result.accountUri.value;
    const account = await selectUserByAccount(accountUri);
    results.push({
      uri: result.uri.value,
      id: result.id.value,
      dateCreation: result.dateCreation.value,
      ...account
    });
  }
 
  return results;
}

export async function getHistoryDetail(historyId) {
  const getInsertsResult = await querySudo(getInserts(historyId));
  const getDeletesResult = await querySudo(getDeletes(historyId));
  const getUpdatesResult = await querySudo(getUpdates(historyId));

  const inserts = getInsertsResult.results.bindings.map(res => {
    return {
      subject: res.subject.value,
      predicate: res.predicate.value,
      obj: res.object.value,
      type: "INSERT",
    }
  });
  const deletes = getDeletesResult.results.bindings.map(res => {
    return {
      subject: res.subject.value,
      predicate: res.predicate.value,
      obj: res.object.value,
      type: "DELETE",
    }
  });
  const updates = getUpdatesResult.results.bindings.map(res => {
    return {
      subject: res.subject.value,
      predicate: res.predicate.value,
      oldObject: res.oldObject.value,
      newObject: res.newObject.value,
      type: "UPDATE",
    }
  });

  return [
    ...updates,...inserts, ...deletes
  ]


}

// #endregion
