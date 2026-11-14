// 非同期処理を 1 つずつ順番に実行するキュー。前の処理が失敗しても後続は実行する
export function createQueue() {
    let tail = Promise.resolve()
    return fn => {
        const run = tail.then(fn, fn)
        tail = run.catch(() => {})
        return run
    }
}
