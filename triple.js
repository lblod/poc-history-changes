import { sparqlEscapeUri, sparqlEscapeString } from "mu";

export default class Triple {
  constructor({ subject, predicate, object, datatype }) {
    this._subject = subject;
    this._predicate = predicate;
    this._object = object;
    this._datatype = datatype;
  }

  isEqual(other) {
    return (
      this._subject?.type === other._subject?.type &&
      this._subject?.value === other._subject?.value &&
      this._predicate?.type === other._predicate?.type &&
      this._predicate?.value === other._predicate?.value &&
      this._object?.type === other._object?.type &&
      this._object?.value === other._object?.value &&
      this._datatype?.type === other._datatype?.type &&
      this._datatype?.value === other._datatype?.value
    );
  }

  get subjectNt() {
    return _toNtriple(this._subject);
  }

  get predicateNt() {
    return _toNtriple(this._predicate);
  }

  get objectNt() {
    return _toNtriple(this._object);
  }

  get subject() {
    return this._subject.value;
  }

  get predicate() {
    return this._predicate.value;
  }

  get object() {
    return this._object.value;
  }

  toNTriple() {
    return {
        subject: this.subjectNt,
        predicate: this.predicateNt,
        object: this.objectNt
    };
  }
}

function _toNtriple(node) {
  if (node.type === "uri") {
    return sparqlEscapeUri(node.value);
  }
  let obj = `${sparqlEscapeString(node.value)}`;
  if (node.datatype) {
    obj += `^^${sparqlEscapeUri(node.datatype)}`;
  }
  return obj;
}
