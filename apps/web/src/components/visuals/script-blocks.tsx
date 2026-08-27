import { Block, BlockInput } from "./block";
import { IconBolt } from "./icons";

/**
 * The "collect a coin" script — the canonical example that appears in the
 * hero editor and in the Blocks card of the Core Idea section.
 */
export function CollisionScriptBlocks() {
  return (
    <div className="flex w-fit flex-col items-start">
      <div className="anim-rise-in">
        <Block color="var(--color-amber)" width={224}>
          <IconBolt size={12} className="shrink-0" />
          when <BlockInput>Player</BlockInput> touches <BlockInput>Coin</BlockInput>
        </Block>
      </div>
      <div className="anim-rise-in -mt-[4.5px]" style={{ animationDelay: "90ms" }}>
        <Block color="var(--color-sky)" width={158}>
          change <BlockInput>Score</BlockInput> by <BlockInput>1</BlockInput>
        </Block>
      </div>
      <div className="anim-rise-in -mt-[4.5px]" style={{ animationDelay: "180ms" }}>
        <Block color="var(--color-rose)" width={176}>
          play sound <BlockInput>coin.wav</BlockInput>
        </Block>
      </div>
    </div>
  );
}
