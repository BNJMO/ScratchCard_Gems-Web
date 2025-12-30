export class GameRules {
  constructor({ gridRows, gridColumns }) {
    this.gridRows = Math.max(1, gridRows || 3);
    this.gridColumns = Math.max(1, gridColumns || 3);
    this.reset();
  }

  reset() {
    this.gameOver = false;
    this.waitingForChoice = false;
    this.selectedTile = null;
    this.revealedMap = new Map();
    this.assignments = new Map();
    this.revealedCount = 0;
    this.totalTiles = this.gridRows * this.gridColumns;
  }

  setAssignments(map) {
    this.assignments = new Map(map ?? []);
    this.revealedMap.clear();
    this.revealedCount = 0;
    this.gameOver = false;
  }

  selectTile(row, col) {
    this.waitingForChoice = true;
    this.selectedTile = { row, col };
  }

  clearSelection() {
    this.waitingForChoice = false;
    this.selectedTile = null;
  }

  revealResult({ row, col, result }) {
    if (this.gameOver) {
      return { face: null, gameOver: true, win: false };
    }

    const key = `${row},${col}`;
    if (this.revealedMap.has(key)) {
      return this.revealedMap.get(key);
    }

    const assigned = this.assignments.get(key);
    const face = result ?? assigned ?? null;
    const outcome = { face, gameOver: false, win: false };

    this.revealedCount += 1;
    if (this.revealedCount >= this.totalTiles) {
      this.gameOver = true;
      outcome.gameOver = true;
    }

    this.revealedMap.set(key, outcome);
    return outcome;
  }

  getState() {
    return {
      grid: this.gridRows,
      gridRows: this.gridRows,
      gridColumns: this.gridColumns,
      totalTiles: this.totalTiles,
      revealed: this.revealedCount,
      gameOver: this.gameOver,
      waitingForChoice: this.waitingForChoice,
      selectedTile: this.selectedTile,
    };
  }
}
