#!/usr/bin/env python3
"""Downloads CC0 furniture and appliance models from Poly Haven (1K textures) into assets-src/polyhaven/<id>/.
Uses Python's urllib because it honours the sandbox proxy settings. Run from the repository root."""
import json, os, sys, urllib.request

MODELS = """
sofa_02 sofa_03 modern_arm_chair_01 mid_century_lounge_chair dining_chair_02 painted_wooden_chair_01 painted_wooden_chair_02
WoodenChair_01 plastic_monobloc_chair_01 wooden_stool_01 bar_chair_round_01 painted_wooden_bench Ottoman_01 Rockingchair_01
SchoolChair_01 folding_wooden_stool
painted_wooden_table round_wooden_table_01 WoodenTable_01 WoodenTable_02 modern_coffee_table_01 modern_coffee_table_02
coffee_table_round_01 CoffeeTable_01 side_table_01 small_wooden_table_01 metal_office_desk SchoolDesk_01 ClassicConsole_01 dining_table
GothicBed_01 vintage_day_bed painted_wooden_nightstand ClassicNightstand_01 GothicCommode_01
wooden_bookshelf_worn painted_wooden_shelves steel_frame_shelves_03 wooden_display_shelves_01 modern_wooden_cabinet drawer_cabinet
painted_wooden_cabinet vintage_cabinet_01 chinese_cabinet
television_02 Television_01 boombox portable_cassette_player classic_laptop gaming_console desk_lamp_arm_01 vintage_radio_transceiver
electric_stove vintage_microwave vintage_electric_kettle ceiling_fan wall_clock mantel_clock_01
potted_plant_01 potted_plant_02 potted_plant_04 ornate_mirror_01 vintage_oil_lamp
""".split()

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets-src", "polyhaven")
HEADERS = {"User-Agent": "TheLifeGame/0.1 (asset fetch)"}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=120).read()


def fetch(asset_id):
    folder = os.path.join(OUT, asset_id)
    if os.path.exists(os.path.join(folder, ".done")):
        return "skip"
    files = json.loads(get(f"https://api.polyhaven.com/files/{asset_id}"))
    entry = files["gltf"]["1k"]["gltf"]
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, f"{asset_id}.gltf"), "wb") as f:
        f.write(get(entry["url"]))
    for rel, info in entry.get("include", {}).items():
        target = os.path.join(folder, rel)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as f:
            f.write(get(info["url"]))
    with open(os.path.join(folder, "LICENSE.txt"), "w") as f:
        f.write(f"{asset_id}: CC0 1.0 (public domain). Source: https://polyhaven.com/a/{asset_id}\n")
    open(os.path.join(folder, ".done"), "w").close()
    return "ok"


if __name__ == "__main__":
    failed = []
    for asset_id in MODELS:
        try:
            print(asset_id, fetch(asset_id), flush=True)
        except Exception as error:  # keep going; report at the end
            failed.append(asset_id)
            print(asset_id, "FAILED", error, flush=True)
    print("failed:", failed)
    sys.exit(1 if failed else 0)
