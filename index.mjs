import childProcess from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs'
import ctx from 'axel';
import bmpJs from 'bmp-js';
import ora from 'ora';

const exec = promisify(childProcess.exec);
const spinner = ora();

const FPS = 30;
try{
    spinner.start('initialization');
    await exec('rm -rf ./tmp/*/*');
    spinner.succeed();

    spinner.start('get w and h');
    const [w, h] = [Math.round(ctx.cols / 2), ctx.rows];
    const isOddWSize = ctx.cols % 2 === 1;
    spinner.succeed();

    spinner.start('convert video to bmp files');
    const src = process.argv[2];
    await exec(
        `ffmpeg` +
        ` -i "${src}"` +
        ` -vf`+
        ` "yadif=deint=interlaced,` +
        ` extractplanes=y,` +
        ` scale=w=trunc(ih*dar/2)*2:h=trunc(ih/2)*2,` +
        ` setsar=1/1,` +
        ` fps=${FPS},` +
        ` scale=w=${w}:h=${h}:force_original_aspect_ratio=1,` +
        ` pad=w=${w}:h=${h}:x=(ow-iw)/2:y=(oh-ih)/2:color=#000000"` +
        ` -vcodec bmp ./tmp/images/image_%d.bmp`
    );
    const frameCount = parseInt((await exec('ls ./tmp/images/ | wc -l')).stdout, 10);
    spinner.succeed(`get ${frameCount} frames`);

    spinner.start('make AAs');
    const AAs = Array(frameCount + 1);
    const AASize = w * 2 * h - isOddWSize * h;

    AAs[0] = ' '.repeat(AASize);
    let finishCount = 0;
    const range = stop => Array(stop).fill().map((_, i) => i + 1);
    await Promise.all(range(frameCount).map(i => (async () => {
        const { data } = bmpJs.decode(await fs.readFile(`./tmp/images/image_${i}.bmp`));
        AAs[i] = Array.from(
                (new Uint8Array(data))
                    .filter((_, i) => (i - 1) % 4 === 0)
            )
            .map((e, i) => {
                if ((i + 1) % w === 0 && isOddWSize) {
                    return e > 128 ? 'W' : ' ';
                } else {
                    return e > 128 ? 'WW' : '  ';
                }
            })
            .join(
                ''
            )
        ;
        spinner.text = `make AAs: ${++finishCount}/${frameCount}`;
    })()));

    spinner.succeed();

    spinner.start('make diff list');
    const diffs = [];
    for (let i = 1; i <= frameCount; i++) {
        diffs[i] = [];
        for(let j = 0;j < AASize;j++) {
            if (AAs[i][j] !== AAs[i-1][j]) {
                const [x, y] = [j % (w * 2 - isOddWSize), Math.floor(j / (w * 2 - isOddWSize))];
                diffs[i].push([x, y, AAs[i][j]]);
            }
        }
    }
    spinner.succeed();

    console.clear();
    await new Promise(res => {
        let i = 1;
        const id = setInterval(() => {
            if (i === frameCount) {
                clearInterval(id);
                res();
            }
            diffs[i].forEach(e => ctx.text(...e));
            ctx.cursor.restore();
            i++;
        }, 1000 / FPS);
    });

} catch(e) {
    if (spinner.isSpinning) spinner.fail();
    console.error(e);
} finally {
    await exec('rm -rf ./tmp/*/*');
}
