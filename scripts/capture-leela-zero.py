"""Capture independent GTP heatmaps from Leela Zero 0.17 CPU on network #116."""

import argparse
import json
import re
import subprocess
from pathlib import Path


def capture(engine, weights, moves):
    commands = []
    for i in range(0, len(moves), 3):
        color, coord = moves[i], moves[i + 1 : i + 3]
        point = (
            "pass"
            if coord == "--"
            else "ABCDEFGHJKLMNOPQRST"[ord(coord[0]) - 97]
            + str(19 - ord(coord[1]) + 97)
        )
        commands.append(f"play {color} {point}")
    run = subprocess.run(
        [engine, "-g", "--noponder", "--cpu-only", "-t", "1", "-w", weights],
        input="\n".join([*commands, "heatmap 0", "quit", ""]),
        capture_output=True,
        text=True,
        check=True,
    )
    if "?" in run.stdout:
        raise RuntimeError(run.stdout)
    # Rows printed from A19 to A1 and rounded down to whole thousandths.
    rows = re.findall(r"^\s*((?:\d+[ \t]+){18}\d+)[ \t]*$", run.stderr, re.MULTILINE)
    if len(rows) != 19:
        raise ValueError("Missing native heatmap")
    native = [int(n) for row in rows for n in row.split()]
    native.append(int(re.search(r"pass: (\d+)", run.stderr).group(1)))
    win = float(re.search(r"winrate: ([.\d]+)", run.stderr).group(1))
    return {
        "moves": moves,
        "next": "W" if moves[-3] == "b" else "B",
        "winrate": win,
        "policyPermille": {i: n for i, n in enumerate(native) if n},
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("leelaz")
    parser.add_argument("weights")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    corpus = json.loads((root / "public/data/games.json").read_text())["games"]
    recorded = next(game["moves"] for game in corpus if game["id"] == "s021")
    # D4 Q16 F3; then C13. The record adds long history, captures and endgame.
    three = "bdpwpdbfq"
    endgame = next(game["moves"] for game in corpus if game["id"] == "s458")
    # Add a pass to exercise the history encoder and a nonzero pass probability.
    positions = [three, three + "wcg", recorded[: 60 * 3], recorded, endgame + "b--"]
    print(
        json.dumps(
            [capture(args.leelaz, args.weights, moves) for moves in positions], indent=2
        )
    )
