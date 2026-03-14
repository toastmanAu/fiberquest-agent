const sqlite3 = require('sqlite3');
const path = require('path');

class Database {
  constructor() {
    this.dbPath = path.join(__dirname, '../data/fiberquest.db');
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) reject(err);
        else {
          this._createTables();
          resolve();
        }
      });
    });
  }

  _createTables() {
    // TODO: Schema for tournaments, players, results, escrow transactions
  }
}

module.exports = Database;
