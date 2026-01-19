let queue: Promise<any> = Promise.resolve()

export function queuedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const signal = init?.signal

  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"))
  }

  const run = async () => {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    return fetch(input, init)
  }

  queue = queue.then(run, run)
  return queue
}
