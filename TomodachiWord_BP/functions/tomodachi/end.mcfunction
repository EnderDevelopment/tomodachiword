# TomodachiWord - reset the tutorial (stops music)
stopsound @s record.chirp
stopsound @s music.game
tellraw @s {"rawtext":[{"text":"§6[Tomodachi]§r Tutorial reiniciado. Usa /function tomodachi:start para empezar de nuevo."}]}
