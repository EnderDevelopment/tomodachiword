// TomodachiWord main script
// Runs on Minecraft Bedrock via Script API.
import { world, system } from "@minecraft/server";
import { ActionFormData, ModalFormData, MessageFormData } from "@minecraft/server-ui";

const MOD_ID = "tomodachi";
const PREFIX = "§6[Tomodachi]§r ";
const SPAWN_EGG = "tomodachi:egg";
const DATA_TAG = "tomodachi_data";

// Story dialogue lines (the tutorial the character says).
const STORY_LINES = [
    "Hola, soycaboxc1.",
    "Para empezar el mod, debes de construir la casa del mii.",
    "Wow!",
    "Ya terminaste eh.",
    "Bien.",
    "Ahora, como te gustaria llamarle a tu ciudad?"
];

// Current player states.
const playerState = new Map(); // playerId -> {step, cityName, miiName, miiRun}

function say(player, text) {
    player.sendMessage(PREFIX + text);
}

function playTone(player, note) {
    // A simple "beep" substitute for the Tomodachi 3DS music.
    // Bedrock has no direct note API; we vibrate/play a sound if available.
    try {
        player.runCommand(`playsound note.bass ${note}`);
    } catch (e) {
        // ignore, sound may not exist
    }
}

function playBackgroundMusic(player) {
    player.runCommand("stopsound @s music.game");
    player.runCommand("playsound record.chirp @s");
}

function stopBackgroundMusic(player) {
    player.runCommand("stopsound @s record.chirp");
    player.runCommand("stopsound @s music.game");
}

// ---- Spawn the character ----
function spawnCharacter(player) {
    const loc = player.location;
    const dir = player.getViewDirection();
    const spawnLoc = {
        x: Math.floor(loc.x + dir.x * 2),
        y: Math.floor(loc.y),
        z: Math.floor(loc.z + dir.z * 2)
    };
    // In beta we spawn a Steve (the talking character).
    const id = player.dimension.spawnEntity("minecraft:player", spawnLoc);
    // Can't easily force a specific skin; we use a marker entity to "own" the player.
    const marker = {
        x: spawnLoc.x,
        y: spawnLoc.y,
        z: spawnLoc.z
    };
    player.setDynamicProperty(DATA_TAG + "_owner_" + player.id, JSON.stringify(marker));
    // Register the entity in our state map.
    playerState.set(player.id, {
        step: 0,
        cityName: "",
        miiName: "",
        miiDone: false,
        character: id
    });
}

function runStoryStep(player) {
    const st = playerState.get(player.id);
    if (!st) return;
    if (st.step < STORY_LINES.length) {
        say(player, STORY_LINES[st.step]);
        playTone(player, "note.bd");
        st.step++;
        system.runTimeout(() => runStoryStep(player), 40); // ~2 seconds
    } else {
        // Story finished -> open city name menu.
        openCityNameMenu(player);
    }
}

// ---- City name menu ----
function openCityNameMenu(player) {
    const form = new ModalFormData()
        .title("Como te gustaria llamarle a tu ciudad?")
        .addTextField("Nombre de la ciudad", "Escribe el nombre...");
    form.show(player).then((res) => {
        if (res.canceled) {
            // Retry if canceled.
            system.runTimeout(() => openCityNameMenu(player), 20);
            return;
        }
        const name = res.formValues[0];
        if (!name || name.trim() === "") {
            say(player, "Escribe un nombre valido por favor.");
            system.runTimeout(() => openCityNameMenu(player), 20);
            return;
        }
        const st = playerState.get(player.id);
        st.cityName = name.trim();
        say(player, "Ohh buen nombre " + st.cityName + " pije.");
        playTone(player, "note.pling");
        system.runTimeout(() => {
            say(player, "Ahora!");
            say(player, "Crea tu mii");
            openMiiMenu(player);
        }, 30);
    });
}

// ---- Mii menu ----
function openMiiMenu(player) {
    const form = new ActionFormData()
        .title("Crea tu Mii")
        .body("Elige el look de tu Mii (beta: zombi como referencia)")
        .button("Mii Zombi (beta)")
        .button("Mii Steve (beta)")
        .button("Mii Alex (beta)");
    form.show(player).then((res) => {
        if (res.canceled) {
            system.runTimeout(() => openMiiMenu(player), 20);
            return;
        }
        const st = playerState.get(player.id);
        st.miiRun = res.selection;
        say(player, "Bien, aca esta...");
        playTone(player, "note.pling");
        // In real Tomodachi you'd rename the Mii here.
        const nameForm = new ModalFormData()
            .title("Nombre del Mii")
            .addTextField("Nombre", "Escribe el nombre del Mii...");
        nameForm.show(player).then((res2) => {
            if (res2.canceled) return;
            const miiName = (res2.formValues[0] || "").trim();
            st.miiName = miiName || "Mii";
            say(player, "Tu Mii " + st.miiName + " esta listo.");
            say(player, "TomodachiWord completado. Disfruta!");
            stopBackgroundMusic(player);
            playerState.get(player.id).done = true;
        });
    });
}

// ---- Player chat handling (respond if they call the mod) ----
world.beforeEvents.chatSend.subscribe((ev) => {
    const msg = ev.message.toLowerCase();
    const player = ev.sender;
    if (msg.includes("tomodachi") && msg.includes("start")) {
        ev.cancel = true;
        startTutorial(player);
    }
    if (msg.includes("tomodachi") && msg.includes("reset")) {
        ev.cancel = true;
        resetTutorial(player);
    }
});

function startTutorial(player) {
    playerState.set(player.id, {
        step: 0,
        cityName: "",
        miiName: "",
        miiDone: false,
        character: null
    });
    say(player, "Bienvenido a TomodachiWord!");
    playBackgroundMusic(player);
    system.runTimeout(() => {
        spawnCharacter(player);
        runStoryStep(player);
    }, 40);
}

function resetTutorial(player) {
    stopBackgroundMusic(player);
    playerState.delete(player.id);
    say(player, "Tutorial reiniciado.");
}

// ---- Item use: right click / tap the spawn egg ----
world.afterEvents.itemUse.subscribe((ev) => {
    const { itemStack, source } = ev;
    if (itemStack && itemStack.typeId === SPAWN_EGG) {
        if (source && source.typeId === "minecraft:player") {
            startTutorial(source);
        }
    }
});

// ---- Commands: /function bridging ----
// Bedrock doesn't allow arbitrary command registration; we expose
// a handful of /function commands in functions/ that call these.

world.afterEvents.worldInitialize.subscribe(() => {
    // Nothing heavy here; hook is reserved.
});

export function api() {
    return {
        startTutorial,
        resetTutorial,
        openCityNameMenu,
        openMiiMenu,
        playBackgroundMusic,
        stopBackgroundMusic
    };
}

console.warn("TomodachiWord script loaded.");
