import { app } from "mu";
import { querySudo, updateSudo } from "@lblod/mu-auth-sudo";
import bodyParser from "body-parser";
import { getAccount, insertHistory } from "./queries";
import Triple from "./triple";

import fs from "fs";

const SESSION_GRAPH_URI =
  process.env.SESSION_GRAPH || "http://mu.semte.ch/graphs/sessions";
const AGGREGATION_INTERVAL =
  process.env.AGGREGATION_INTERVAL || 5000;

const STORE = new Map();

app.use(
  bodyParser.json({
    type: function (req) {
      return /^application\/json/.test(req.get("content-type"));
    },
  })
);

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

// ######## functions

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

setInterval(() => {
  let now = new Date();
  const sink = [...STORE].filter(
    ([k, v]) => now.getTime() - v.date.getTime() >= AGGREGATION_INTERVAL
  );
  for (const [k, change] of sink) {
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

    fs.writeFileSync(
      `/data/${now.getTime()}.sparql`,
      insertHistory({
        date: change.date,
        account: change.account,
        insertions: insertions.map((i) => i.toNTriple()),
        deletions: deletions.map((d) => d.toNTriple()),
        updates,
      })
    );
    STORE.delete(k);
  }
}, 1000);
