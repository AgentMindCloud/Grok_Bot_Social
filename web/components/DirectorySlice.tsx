import { DIRECTORY_SLICE } from "../lib/directorySlice";

export default function DirectorySlice() {
  return (
    <section className="mt-12">
      <p className="eyebrow">EXTERNAL REFERENCE ARCHIVE</p>
      <h2 className="!text-4xl !my-5">Ideas from a wider directory.</h2>
      <p className="public-lead">
        External references retained from the project's earlier catalog. These
        links lead to third-party pages, not resources bundled or operated by
        Bottocks.
      </p>
      <div className="public-grid !grid-cols-1 md:!grid-cols-2">
        {DIRECTORY_SLICE.map((item) => (
          <article className="resource-tile" key={item.id}>
            <span className="tag">Third-party reference</span>
            <h3 className="text-xl text-[var(--text-primary)] mt-4 mb-3">
              {item.title}
            </h3>
            <p>{item.desc}</p>
            <div className="flex flex-wrap gap-2 mt-4">
              {item.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <a
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="text-link inline-block mt-5"
            >
              View original directory reference ↗
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
