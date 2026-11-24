use super::{Connector, ConnectorId, Context};
use crate::{Candidate, Failure, Seed};

pub struct UrlList;

impl Connector for UrlList {
    fn id(&self) -> ConnectorId {
        ConnectorId::UrlList
    }

    fn discover_one(&self, seed: &Seed, _: &mut Context<'_>) -> Result<Vec<Candidate>, Failure> {
        Ok(vec![self.direct(seed, &seed.url)?])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::{Request, Response, Traffic, Transport};

    struct Offline;
    impl Transport for Offline {
        fn fetch(&self, _: Request, _: &mut Traffic) -> Result<Response, Failure> {
            panic!("URL list discovery does not fetch")
        }
    }

    #[test]
    fn reads_plain_urls_and_research_jsonl() {
        let mut seeds = include_str!("../../tests/fixtures/url-list.txt").lines();
        let plain = super::super::parse_seed(seeds.next().unwrap()).unwrap();
        let json = super::super::parse_seed(seeds.next().unwrap()).unwrap();
        let candidates: Vec<_> = UrlList
            .discover(
                Box::new([plain, json].into_iter().map(|seed| (seed, None))),
                &Offline,
                None,
            )
            .map(|entry| entry.candidate.unwrap())
            .collect();
        assert_eq!(candidates[0].format_guess.as_deref(), Some("zip"));
        assert_eq!(candidates[1].bundle_id.as_deref(), Some("example.viewer"));
        assert_eq!(candidates[1].version.as_deref(), Some("2.1"));
    }
}
