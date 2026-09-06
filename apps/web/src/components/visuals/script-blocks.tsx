import { Block, BlockInput } from "./block";
import { IconBolt } from "./icons";

/**
 * The coin-run scene's opening script — real Ideaven IR blocks (the same
 * types the builder's Blocks mode exposes: screen event hat, set-variable,
 * navigate), rendered with the shared block primitives.
 */
export function CollisionScriptBlocks() {
  return (
    <div className="flex w-fit flex-col items-start">
      <div className="anim-rise-in">
        <Block color="var(--color-sky)" width={214}>
          <IconBolt size={12} className="shrink-0" />
          when <BlockInput>Screen</BlockInput> initializes
        </Block>
      </div>
      <div className="anim-rise-in -mt-[4.5px]" style={{ animationDelay: "90ms" }}>
        <Block color="var(--color-rose)" width={196}>
          set variable <BlockInput>score</BlockInput> to <BlockInput>0</BlockInput>
        </Block>
      </div>
      <div className="anim-rise-in -mt-[4.5px]" style={{ animationDelay: "180ms" }}>
        <Block color="var(--color-violet)" width={150}>
          navigate to <BlockInput>Game Over</BlockInput>
        </Block>
      </div>
    </div>
  );
}
